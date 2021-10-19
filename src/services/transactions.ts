import { Pool } from "pg";
import { Request, Response } from "express";

import {
  mapTransactionFragToResponse,
  mapTxRowsToTransactionFrags
} from "../utils/mappers";

const transactionsQuery = `
SELECT tx.hash
    , tx.fee
    , tx.valid_contract
    , tx.script_size
    , tx_metadata_agg(tx.id) as metadata
    , tx.block_index as "txIndex"
    , block.block_no as "blockNumber"
    , block.hash as "blockHash"
    , block.epoch_no as "blockEpochNo"
    , block.slot_no as "blockSlotNo"
    , block.epoch_slot_no as "blockSlotInEpoch"
    , block_era_from_vrf_key(vrf_key) as "blockEra"
    , block.time at time zone 'UTC' as "includedAt"
    , in_addr_val_pairs(tx.hash) as "inAddrValPairs"
    , collateral_in_addr_val_pairs(tx.hash) as "collateralInAddrValPairs"
    , withdraws_agg(tx.id) as "withdrawals"
    , certificates_agg(tx.id) as "certificates"
    , out_addr_val_pairs(tx.id, tx.hash) as "outAddrValPairs"
FROM tx
    INNER JOIN block on tx.block_id = block.id
WHERE encode(tx.hash, 'hex') = ANY(($1)::varchar array);
`;

export const handleGetTransactions = (pool: Pool) => async (req: Request, res: Response) => {
  if(!req.body || !req.body.ids) {
    throw new Error("error, no tx ids informed.");
  }
  if (!Array.isArray(req.body.ids)) {
    throw new Error("'ids' should be an array.");
  }
  const txIds: string[] = req.body.ids;
  if (txIds.length > 100) {
    throw new Error("Max limit of 100 tx ids exceeded.");
  }
  if (txIds.length === 0) {
    throw new Error("error, at least 1 tx id should be informed.");
  }

  const result = await pool.query(transactionsQuery, [txIds]);
  const txs = mapTxRowsToTransactionFrags(result.rows);
  const responseObj: {[key: string]: any} = {};
  for (const tx of txs) {
    responseObj[tx.hash] = mapTransactionFragToResponse(tx);
  }

  res.send(responseObj);
};