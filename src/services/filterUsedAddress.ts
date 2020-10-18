import { Pool } from "pg";
import { Request, Response } from "express";
import {
  Address,
  ByronAddress,
} from "@emurgo/cardano-serialization-lib-nodejs";

import config from "config";
import { assertNever, validateAddressesReq, getSpendingKeyHash } from "../utils";

const baseQuery = `
  select ( select json_agg((address)) 
           from tx_out 
           where tx_id = outertx.tx_id) as outputs,
         ( select json_agg((address)) 
           from tx_out 
           join tx_in 
             on tx_in.tx_out_id = tx_out.tx_id 
            and tx_in.tx_out_index = tx_out.index 
           where tx_in_id = outertx.tx_id) as inputs
  from tx_out as outertx 
`;
const filterByAddressQuery = `
  ${baseQuery}
  where address = any(($1)::varchar array)
`;
const filterByPaymentCredQuery = `
  ${baseQuery}
  where payment_cred = any(($1)::bytea array)
`;

const addressesRequestLimit:number = config.get("server.addressRequestLimit");

export function getAddressesByType(addresses: string[]): {
  /**
   * note: we keep track of explicit bech32 addresses
   * since it's possible somebody wants the tx history for a specific address
   * and not the tx history for the payment key of the address
   */
  legacyAddr: string[],
  bech32: string[],
  paymentKeyMap: Map<string, Set<string>>,
} {
  const legacyAddr = [];
  const bech32 = [];
  const paymentKeyMap = new Map();
  for (const address of addresses) {
    // 1) Check if it's a Byron-era address
    if (ByronAddress.is_valid(address)) {
      legacyAddr.push(address);
      continue;
    }
    // 2) check if it's a valid bech32 address
    try {
      const wasmBech32 = Address.from_bech32(address);
      bech32.push(address);
      wasmBech32.free();
      continue;
    } catch (_e) {
      // silently discard any non-valid Cardano addresses
    }
    try {
      const wasmAddr = Address.from_bytes(
        Buffer.from(address, "hex")
      );
      const spendingKeyHash = getSpendingKeyHash(wasmAddr);
      if (spendingKeyHash != null) {
        const addressesForKey = paymentKeyMap.get(spendingKeyHash) ?? new Set();
        addressesForKey.add(address);
        paymentKeyMap.set(spendingKeyHash, addressesForKey);
      }
      wasmAddr.free();
      continue;
    } catch (_e) {
      // silently discard any non-valid Cardano addresses
    }
  }

  return {
    legacyAddr,
    bech32,
    paymentKeyMap,
  };
}


export const filterUsedAddresses = (pool : Pool) => async (req: Request, res: Response) => {
  if(!req.body || !req.body.addresses) {
    throw new Error("no addresses in request body.");
    return;
  }
  const verifiedAddrs = validateAddressesReq(addressesRequestLimit, req.body.addresses);
  const addressTypes = getAddressesByType(req.body.addresses);
  switch(verifiedAddrs.kind){
  case "ok": {
    const regularAddresses = [
      ...addressTypes.legacyAddr,
      ...addressTypes.bech32,
    ];

    const result: Set<string> = new Set();

    if (addressTypes.paymentKeyMap.size > 0) {
      // 1) Get all transactions that contain one of these payment keys
      const queryResult = await pool.query(
        filterByPaymentCredQuery,
        [Array
          .from(addressTypes.paymentKeyMap.keys())
          .map(addr => `\\x${addr}`)
        ]
      );
      // 2) get all the addresses inside these transactions
      const addressesInTxs = queryResult.rows.flatMap( tx => [tx.inputs, tx.outputs]).flat();
      console.log(queryResult.rows);
      console.log(Array.from(addressTypes.paymentKeyMap.keys()));
      // 3) get the payment credential for each address in the transaction
      const keysInTxs: Array<string> = addressesInTxs.reduce(
        (arr, next) => {
          try {
            const wasmAddr = Address.from_bech32(next);
            const paymentCred = getSpendingKeyHash(wasmAddr);
            if (paymentCred != null) arr.push(paymentCred);
            wasmAddr.free();
          } catch (_e) {
            // silently discard any non-valid Cardano addresses
          }
          
          return arr;
        },
        ([] as Array<string>)
      );
      // 4) filter addresses to the ones we care about for this filterUsed query
      keysInTxs
        .flatMap(addr => Array.from(addressTypes.paymentKeyMap.get(addr) ?? []))
        .forEach(addr => result.add(addr));
    }
    if (regularAddresses.length > 0) {
      // 1) Get all transactions that contain one of these addresses
      const queryResult = await pool.query(filterByAddressQuery, [regularAddresses]);
      // 2) get all the addresses inside these transactions
      const addressesInTxs = queryResult.rows.flatMap( tx => [tx.inputs, tx.outputs]).flat();
      // 3) filter addresses to the ones we care about for this filterUsed query
      const addressSet = new Set(regularAddresses);
      addressesInTxs
        .filter(addr => addressSet.has(addr))
        .forEach(addr => result.add(addr));
    }
    res.send([...result]);
    return;

  }
  case "error":
    throw new Error(verifiedAddrs.errMsg);
    return;
  default: return assertNever(verifiedAddrs);
  }
};
