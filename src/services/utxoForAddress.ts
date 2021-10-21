import { Pool } from "pg";
import { Request, Response } from "express";

import config from "config";
import {assertNever, validateAddressesReq, getAddressesByType, extractAssets,} from "../utils";

import { getBlock, getLatestBlock } from "../utils/queries/block";

const utxoForAddressQuery = `
    SELECT *
    FROM valid_utxos_view
    WHERE address = any(($1)::varchar array) 
         OR payment_cred = any(($2)::bytea array);
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

const utxoForAddressesV2Query = `SELECT tx_out.address,
       tx_out.payment_cred,
       encode(tx.hash::bytea, 'hex'::text) AS hash,
       tx_out.index,
       tx_out.value,
       block.block_no AS "blockNumber",
       (
           SELECT json_agg(
               ROW (
                   encode(ma_tx_out.policy::bytea, 'hex'::text),
                   encode(ma_tx_out.name::bytea, 'hex'::text),
                   ma_tx_out.quantity)
               ) AS json_agg
            FROM ma_tx_out
            WHERE ma_tx_out.tx_out_id = tx_out.id
        ) AS assets
FROM tx
    JOIN tx_out ON tx.id = tx_out.tx_id
    JOIN block ON block.id = tx.block_id
WHERE tx.valid_contract
    AND block.block_no <= ($3)::uinteger
    AND NOT utxo_used_as_invalid_collateral(tx_out.tx_id, tx_out.index::smallint, ($3)::uinteger)
    AND NOT utxo_used_as_valid_input(tx_out.tx_id, tx_out.index::smallint, ($3)::uinteger)
    AND (
      tx_out.address = any(($1)::varchar array) 
      OR payment_cred = any(($2)::bytea array)
    )
ORDER BY tx.hash
LIMIT $4::uinteger OFFSET $5::uinteger;
`;

export const utxoForAddressesV2 = (pool: Pool) => async (req: Request, res: Response) => {
  if(!req.body || !req.body.addresses) {
    throw new Error("error, no addresses.");
  }
  if (!req.body.pagination) {
    throw new Error("error, pagination info missing. It should include `limit` and `offset` wrapped inside a `pagination` object.");
  }

  const limit = parseInt(req.body.pagination.limit);
  const offset = parseInt(req.body.pagination.offset);

  if (isNaN(limit) || isNaN(offset)) {
    throw new Error("error, pagination offset and limit should be numbers.");
  }

  const addressTypes = getAddressesByType(req.body.addresses);
  const verifiedAddresses = validateAddressesReq(addressesRequestLimit, req.body.addresses);
  switch (verifiedAddresses.kind) {
    case "ok": {
      const referenceBlock = req.body.referenceBlock
        ? await getBlock(pool)(req.body.referenceBlock)
        : await getLatestBlock(pool);

      const result = await pool.query(
        utxoForAddressesV2Query,
        [
          [
            ...addressTypes.legacyAddr,
            ...addressTypes.bech32,
          ]
          , addressTypes.paymentCreds
          , referenceBlock.number
          , limit
          , offset
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
    default: return assertNever(verifiedAddresses);
  }
};
