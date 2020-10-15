import { Pool } from "pg";
import { Request, Response } from "express";

import config from "config";
import { assertNever, getCardanoSpendingKeyHash, isHex, validateAddressesReq } from "../utils";

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

export const filterUsedAddresses = (pool : Pool) => async (req: Request, res: Response) => {
  if(!req.body || !req.body.addresses) {
    throw new Error("no addresses in request body.");
    return;
  }
  const verifiedAddrs = validateAddressesReq(addressesRequestLimit, req.body.addresses);
  switch(verifiedAddrs.kind){
  case "ok": {
    const paymentCreds = new Set(verifiedAddrs.value.filter(isHex).map((s:string) => `\\x${s}`));
    const addresses = new Set(verifiedAddrs.value.filter(addr => !isHex(addr)));

    const result: Set<string> = new Set();

    if (paymentCreds.size > 0) {
      // 1) Get all transactions that contain one of these payment keys
      const queryResult = await pool.query(filterByPaymentCredQuery, [Array.from(paymentCreds)]);
      // 2) get all the addresses inside these transactions
      const addressesInTxs = queryResult.rows.flatMap( tx => [tx.inputs, tx.outputs]).flat();
      // 3) get the payment credential for each address in the transaction
      const keysInTxs: Array<string> = addressesInTxs.reduce(
        (arr, next) => {
          const paymentCred = getCardanoSpendingKeyHash(next);
          if (paymentCred != null) arr.push(paymentCred);
          return arr;
        },
        ([] as Array<string>)
      );
      // 4) filter addresses to the ones we care about for this filterUsed query
      keysInTxs
        .filter(addr => paymentCreds.has(`\\x${addr}`))
        .forEach(addr => result.add(addr));
    }
    if (addresses.size > 0) {
      // 1) Get all transactions that contain one of these addresses
      const queryResult = await pool.query(filterByAddressQuery, [Array.from(addresses)]);
      // 2) get all the addresses inside these transactions
      const addressesInTxs = queryResult.rows.flatMap( tx => [tx.inputs, tx.outputs]).flat();
      // 3) filter addresses to the ones we care about for this filterUsed query
      addressesInTxs
        .filter(addr => addresses.has(addr))
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
