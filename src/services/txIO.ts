import { Pool } from "pg";
import { Request, Response } from "express";
import { TransInputFrag, TransOutputFrag } from "../Transactions/types";
import { extractAssets } from "../utils";

export const handleGetTxIO = (pool: Pool) => async (req: Request, res:Response): Promise<void> => {
  if (!req.params.tx_hash || req.params.tx_hash.trim() === "") throw new Error("missing tx_hash on request path");

  const tx_hash = req.params.tx_hash.trim();

  if (!(await txExists(pool, tx_hash))) throw new Error("transaction can't be found");

  const inputs = await getInputs(pool, tx_hash);
  const collateralInputs = await getCollateralInputs(pool, tx_hash);
  const outputs = await getOutputs(pool, tx_hash);

  res.send({
    inputs, collateralInputs, outputs
  });
};

const txExists = async (pool: Pool, tx_hash: string): Promise<boolean> => {
  const query = `
    select * from tx
    where encode(tx.hash, 'hex') = $1
    limit 1`;

  const result = await pool.query(query, [tx_hash]);

  return result.rowCount === 1;
};

const getInputs = async (pool: Pool, tx_hash: string): Promise<Array<TransInputFrag>> => {
  const query = `
    select
      tx_out.address,
      tx_out.value,
      tx_in.tx_out_index,
      (
        select json_agg(ROW(encode("policy", 'hex'), encode("name", 'hex'), "quantity"))
        from ma_tx_out
        where ma_tx_out.tx_out_id = tx_out.id
      ) as asset_queries
    from tx
    join tx_in on tx_in.tx_in_id = tx.id
    join tx_out on tx_in.tx_out_id = tx_out.tx_id and tx_in.tx_out_index::smallint = tx_out.index::smallint
    join tx source_tx on tx_out.tx_id = source_tx.id
    where encode(tx.hash, 'hex') = $1
    order by tx_in.id asc`;

  const result = await pool.query(query, [tx_hash]);

  return result.rows.map((row: any): TransInputFrag => ({
    address: row.address,
    amount: row.value,
    id: tx_hash.concat(row.tx_out_index),
    index: row.tx_out_index,
    txHash: tx_hash,
    assets: extractAssets(row.asset_queries)
  }));
};

const getCollateralInputs = async (pool: Pool, tx_hash: string): Promise<Array<TransInputFrag>> => {
  const query = `
    select
      tx_out.address,
      tx_out.value,
      tx_in.tx_out_index,
      (
        select json_agg(ROW(encode("policy", 'hex'), encode("name", 'hex'), "quantity"))
        from ma_tx_out
        where ma_tx_out.tx_out_id = tx_out.id
      ) as asset_queries
    from tx
    join collateral_tx_in tx_in on tx_in.tx_in_id = tx.id
    join tx_out on tx_in.tx_out_id = tx_out.tx_id and tx_in.tx_out_index::smallint = tx_out.index::smallint
    join tx source_tx on tx_out.tx_id = source_tx.id
    where encode(tx.hash, 'hex') = $1
    order by tx_in.id asc`;

  const result = await pool.query(query, [tx_hash]);

  return result.rows.map((row: any): TransInputFrag => ({
    address: row.address,
    amount: row.value,
    id: tx_hash.concat(row.tx_out_index),
    index: row.tx_out_index,
    txHash: tx_hash,
    assets: extractAssets(row.asset_queries)
  }));
};

const getOutputs = async (pool: Pool, tx_hash: string): Promise<Array<TransOutputFrag>> => {
  const query = `
    select
      tx_out.address,
      tx_out.value,
      (
        select json_agg(ROW(encode("policy", 'hex'), encode("name", 'hex'), "quantity"))
        from ma_tx_out
        where ma_tx_out.tx_out_id = tx_out.id
      ) as asset_queries
    from tx
    join tx_out on tx.id = tx_out.tx_id
    where encode(tx.hash, 'hex') = $1
    order by tx_out.index asc`;

  const result = await pool.query(query, [tx_hash]);

  return result.rows.map((row: any): TransOutputFrag => ({
    address: row.address,
    amount: row.value,
    assets: extractAssets(row.asset_queries)
  }));
};
