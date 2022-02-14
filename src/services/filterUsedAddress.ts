import { Pool } from "pg";
import { Request, Response } from "express";
import { Address } from "@emurgo/cardano-serialization-lib-nodejs";

import config from "config";
import {
  assertNever,
  validateAddressesReq,
  getSpendingKeyHash,
  getAddressesByType,
} from "../utils";
import { decode, encode, toWords } from "bech32";
import { Prefixes } from "../utils/cip5";

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

const addressesRequestLimit: number = config.get("server.addressRequestLimit");

export const filterUsedAddresses =
  (pool: Pool) => async (req: Request, res: Response) => {
    if (!req.body || !req.body.addresses) {
      throw new Error("no addresses in request body.");
      return;
    }
    const verifiedAddrs = validateAddressesReq(
      addressesRequestLimit,
      req.body.addresses
    );
    const addressTypes = getAddressesByType(req.body.addresses);
    switch (verifiedAddrs.kind) {
      case "ok": {
        const regularAddresses = [
          ...addressTypes.legacyAddr,
          ...addressTypes.bech32,
        ];

        const result: Set<string> = new Set();

        if (addressTypes.paymentCreds.length > 0) {
          // 1) Get all transactions that contain one of these payment keys
          const queryResult = await pool.query(filterByPaymentCredQuery, [
            addressTypes.paymentCreds,
          ]);
          // 2) get all the addresses inside these transactions
          const addressesInTxs = queryResult.rows
            .flatMap((tx) => [tx.inputs, tx.outputs])
            .flat();
          // 3) get the payment credential for each address in the transaction
          const keysInTxs: Array<string> = addressesInTxs.reduce(
            (arr, next) => {
              try {
                decode(next, 1000); // check it's a valid bech32 address
                const wasmAddr = Address.from_bech32(next);
                const paymentCred = getSpendingKeyHash(wasmAddr);
                if (paymentCred != null) arr.push(paymentCred);
                wasmAddr.free();
              } catch (_e) {
                // silently discard any non-valid Cardano addresses
              }

              return arr;
            },
            [] as Array<string>
          );
          const paymentCredSet = new Set(
            addressTypes.paymentCreds.map((str) => str.substring(2)) // cutoff \\x prefix
          );
          // 4) filter addresses to the ones we care about for this filterUsed query
          keysInTxs
            .filter((addr) => paymentCredSet.has(addr))
            .map((addr) =>
              encode(
                Prefixes.PAYMENT_KEY_HASH,
                toWords(Buffer.from(addr, "hex"))
              )
            )
            .forEach((addr) => result.add(addr));
        }
        if (regularAddresses.length > 0) {
          // 1) Get all transactions that contain one of these addresses
          const queryResult = await pool.query(filterByAddressQuery, [
            regularAddresses,
          ]);
          // 2) get all the addresses inside these transactions
          const addressesInTxs = queryResult.rows
            .flatMap((tx) => [tx.inputs, tx.outputs])
            .flat();
          // 3) filter addresses to the ones we care about for this filterUsed query
          const addressSet = new Set(regularAddresses);
          addressesInTxs
            .filter((addr) => addressSet.has(addr))
            .forEach((addr) => result.add(addr));
        }
        res.send(Array.from(result));
        return;
      }
      case "error":
        throw new Error(verifiedAddrs.errMsg);
        return;
      default:
        return assertNever(verifiedAddrs);
    }
  };
