import { Pool } from "pg";
import { Request, Response } from "express";

import config from "config";
import { assertNever, isHex, validateAddressesReq } from "../utils";

const utxoForAddressQuery = `
  select tx_out.address
       , encode(tx.hash,'hex') as hash
       , tx_out.index
       , tx_out.value
       , block.block_no as "blockNumber"
  FROM tx
  JOIN tx_out
    ON tx.id = tx_out.tx_id
  LEFT JOIN tx_in
    ON tx_out.tx_id = tx_in.tx_out_id
   AND tx_out.index::smallint = tx_in.tx_out_index::smallint
  JOIN block
    on block.id = tx.block
  WHERE tx_in.tx_in_id IS NULL
    and (   tx_out.address = any(($1)::varchar array) 
         or tx_out.payment_cred = any(($2)::bytea array));
`;

const addressesRequestLimit:number = config.get("server.addressRequestLimit");

export const utxoForAddresses = (pool: Pool) => async (req: Request, res: Response) => {
  if(!req.body || !req.body.addresses) {
    throw new Error("error, no addresses.");
    return;
  }
  const verifiedAddresses = validateAddressesReq(addressesRequestLimit
    , req.body.addresses);
  switch(verifiedAddresses.kind){
  case "ok": {
    const paymentCreds = verifiedAddresses.value.filter(isHex).map((s:string) => `\\x${s}`);
    const result = await pool.query(utxoForAddressQuery, [verifiedAddresses.value, paymentCreds]);
    const utxos = result.rows.map ( utxo => 
      ({ utxo_id: `${utxo.hash}:${utxo.index}`
        , tx_hash: utxo.hash
        , tx_index: utxo.index
        , receiver: utxo.address
        , amount: utxo.value.toString()
        , block_num: utxo.blockNumber }));
    res.send(utxos);
    return;
  }
  case "error":
    throw new Error(verifiedAddresses.errMsg);
    return;
  default: return assertNever(verifiedAddresses);
  }
};




