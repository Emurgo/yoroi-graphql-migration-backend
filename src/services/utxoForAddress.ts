import { Pool } from "pg";
import { Request, Response } from "express";

import config from "config";
import {assertNever, validateAddressesReq, getAddressesByType, extractAssets,} from "../utils";

const utxoForAddressQuery = `
  select tx_out.address
       , encode(tx.hash,'hex') as hash
       , tx_out.index
       , tx_out.value
       , block.block_no as "blockNumber"
       , (select json_agg(ROW (encode("policy", 'hex'), encode("name", 'hex'), "quantity"))
          from ma_tx_out
          WHERE ma_tx_out."tx_out_id" = tx_out.id) as assets
  FROM tx
  JOIN tx_out
    ON tx.id = tx_out.tx_id
  LEFT JOIN tx_in spent_utxo -- gets when / if the output was used as a input
    ON tx_out.tx_id = spent_utxo.tx_out_id
   AND tx_out.index::smallint = spent_utxo.tx_out_index::smallint
  LEFT JOIN tx as spent_utxo_tx
    ON spent_utxo.tx_in_id = spent_utxo_tx.id
  LEFT JOIN collateral_tx_in spent_utxo_coll -- gets when / if the output was used as a collateral input
    ON tx_out.tx_id = spent_utxo_coll.tx_out_id
   AND tx_out.index::smallint = spent_utxo_coll.tx_out_index::smallint
  LEFT JOIN tx as spent_utxo_coll_tx
    ON spent_utxo_coll.tx_in_id = spent_utxo_coll_tx.id
  JOIN block
    ON block.id = tx.block_id
  WHERE tx.valid_contract -- excludes outputs from all invalid txs
    and (
      spent_utxo.tx_in_id IS NULL -- excludes outputs which have been used as inputs...
      or not spent_utxo_tx.valid_contract -- ... but not if this input was used in a invalid tx
    )
    and (
      spent_utxo_coll.tx_in_id IS NULL -- excludes outputs which have been used as collateral inputs...
      or spent_utxo_coll_tx.valid_contract -- ... but not if this collateral input was used in a valid tx
    )
    and (   tx_out.address = any(($1)::varchar array) 
         or tx_out.payment_cred = any(($2)::bytea array));
`;

const addressesRequestLimit:number = config.get("server.addressRequestLimit");

export const utxoForAddresses = (pool: Pool) => async (req: Request, res: Response) => {
  if(!req.body || !req.body.addresses) {
    throw new Error("error, no addresses.");
    return;
  }
  const addressTypes = getAddressesByType(req.body.addresses);
  const verifiedAddresses = validateAddressesReq(addressesRequestLimit
    , req.body.addresses);
  switch(verifiedAddresses.kind){
  case "ok": {
    const result = await pool.query(
      utxoForAddressQuery,
      [
        [
          ...addressTypes.legacyAddr,
          ...addressTypes.bech32,
        ]
        , addressTypes.paymentCreds
      ]
    );
    const utxos = result.rows.map ( utxo => 
      ({ utxo_id: `${utxo.hash}:${utxo.index}`
        , tx_hash: utxo.hash
        , tx_index: utxo.index
        , receiver: utxo.address
        , amount: utxo.value.toString()
          , assets: extractAssets(utxo.assets)
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
