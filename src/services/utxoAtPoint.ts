import { Pool } from "pg";
import { Request, Response } from "express";

import { getAddressesByType, extractAssets } from "../utils";

import { getBlock } from "../utils/queries/block";

const utxoAtPointQuery = `SELECT tx_out.address,
       tx_out.payment_cred,
       encode(tx.hash::bytea, 'hex'::text) AS hash,
       tx_out.index,
       tx_out.value,
       block.block_no AS "blockNumber",
       (
           SELECT json_agg(
               ROW (
                   encode(multi_asset.policy::bytea, 'hex'::text),
                   encode(multi_asset.name::bytea, 'hex'::text),
                   ma_tx_out.quantity)
               ) AS json_agg
            FROM ma_tx_out
              INNER JOIN multi_asset on ma_tx_out.ident = multi_asset.id
            WHERE ma_tx_out.tx_out_id = tx_out.id
        ) AS assets
FROM tx
    JOIN tx_out ON tx.id = tx_out.tx_id
    JOIN block ON block.id = tx.block_id
WHERE tx.valid_contract
    AND block.block_no <= ($3)::word31type
    AND NOT utxo_used_as_invalid_collateral(tx_out.tx_id, tx_out.index::smallint, ($3)::word31type)
    AND NOT utxo_used_as_valid_input(tx_out.tx_id, tx_out.index::smallint, ($3)::word31type)
    AND (
      tx_out.address = any(($1)::varchar array) 
      OR payment_cred = any(($2)::bytea array)
    )
ORDER BY tx.hash
LIMIT $4::word31type OFFSET $5::word31type;
`;

export const utxoAtPoint =
  (pool: Pool) => async (req: Request, res: Response) => {
    if (!req.body) {
      throw new Error("error, missing request body.");
    }

    const addresses: string[] = req.body.addresses;
    if (!addresses || addresses.length === 0) {
      throw new Error("error, no addresses.");
    }

    if (!req.body.referenceBlockHash) {
      throw new Error("error, missing the `referenceBlockHash`.");
    }

    const page = parseInt(req.body.page);
    const pageSize = parseInt(req.body.pageSize);

    if (isNaN(page) || isNaN(pageSize)) {
      throw new Error("error, page and pageSize should be numbers.");
    }

    if (page <= 0 || pageSize <= 0) {
      throw new Error("error, page and pageSize should be positive integers.");
    }

    const offset = (page - 1) * pageSize;
    const addressTypes = getAddressesByType(addresses);

    const referenceBlock = await getBlock(pool)(req.body.referenceBlockHash);
    if (!referenceBlock) {
      throw new Error("REFERENCE_POINT_BLOCK_NOT_FOUND");
    }

    const result = await pool.query(utxoAtPointQuery, [
      [...addressTypes.legacyAddr, ...addressTypes.bech32],
      addressTypes.paymentCreds,
      referenceBlock.number,
      pageSize,
      offset,
    ]);

    const utxos = result.rows.map((utxo) => ({
      utxo_id: `${utxo.hash}:${utxo.index}`,
      tx_hash: utxo.hash,
      tx_index: utxo.index,
      receiver: utxo.address,
      amount: utxo.value.toString(),
      assets: extractAssets(utxo.assets),
      block_num: utxo.blockNumber,
    }));

    res.send(utxos);
  };
