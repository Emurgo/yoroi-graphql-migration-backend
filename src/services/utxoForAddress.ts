import { Pool } from "pg";
import { Request, Response } from "express";

import config from "config";
import {assertNever, validateAddressesReq, getAddressesByType, extractAssets,} from "../utils";

const utxoForAddressQuery = `
    SELECT
      tx_out.address
    , encode(tx.hash,'hex') as hash
    , tx_out.index
    , tx_out.value
    , block.block_no as "blockNumber"
    , (select json_agg(ROW (encode("policy", 'hex'), encode("name", 'hex'), "quantity"))
      from ma_tx_out
      WHERE ma_tx_out."tx_out_id" = tx_out.id) as assets
    FROM tx
      INNER JOIN tx_out ON tx.id = tx_out.tx_id
      INNER JOIN block ON block.id = tx.block_id
    WHERE tx.valid_contract -- utxos only from valid txs
      -- exclude collateral inputs spent in invalid txs
      AND NOT EXISTS (
        SELECT true
        FROM collateral_tx_in
          LEFT JOIN tx as collateral_tx ON collateral_tx_in.tx_in_id = collateral_tx.id
        WHERE collateral_tx.valid_contract = 'false' -- collateral was burned
          AND tx_out.tx_id = collateral_tx_in.tx_out_id
          AND tx_out.index = collateral_tx_in.tx_out_index
      )
      -- exclude tx outputs used as tx input in valid tx
      AND NOT EXISTS (
        SELECT true
        FROM tx_in -- utxos attempted to be used as input in valid txs
          LEFT JOIN tx as input_tx ON tx_in.tx_in_id = input_tx.id
        WHERE input_tx.valid_contract -- input comes from a valid tx
          AND tx_out.tx_id = tx_in.tx_out_id
          AND tx_out.index = tx_in.tx_out_index
      )
      AND (tx_out.address = any(($1)::varchar array) 
         OR tx_out.payment_cred = any(($2)::bytea array));
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
