import { Pool } from "pg";
import { Request, Response } from "express";
import config from "config";

import { extractAssets } from "../utils";
import { Asset } from "../Transactions/types";

const transactionRequestLimit: number = config.get(
  "server.transactionRequestLimit"
);

type UtxoInfo = {
  utxo_id: string; // concat tx_hash and tx_index
  tx_hash: string;
  tx_index: number;
  block_num: number;
  receiver: string;
  amount: string;
  assets: Asset[];
};
type TransactionIdType = { txHash: string; index: number };

export const utxoForTransaction =
  (pool: Pool) => async (req: Request, res: Response<Array<UtxoInfo>>) => {
    if (!req.body || !req.body.transactions) {
      throw new Error("error, no transactions.");
    }

    if (
      !Array.isArray(req.body.transactions) &&
      req.body.transactions.length > transactionRequestLimit
    ) {
      throw new Error("error, invalid request.");
    }

    const whereConditions = req.body.transactions
      .map((_: TransactionIdType, idx: number) => {
        const query = `(index = ($${idx * 2 + 1})::smallint
            and hash = ($${idx * 2 + 2})::varchar )`;
        return query;
      })
      .join(" or ");

    const params = req.body.transactions
      .map((transaction: TransactionIdType) => {
        return [transaction.index, transaction.txHash];
      })
      .reduce((prev: [], curr: []) => prev.concat(curr), []);

    const utxoForTransactionQuery = `SELECT *
      FROM valid_utxos_view
      WHERE ${whereConditions}`;

    const result = await pool.query(utxoForTransactionQuery, params);

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
