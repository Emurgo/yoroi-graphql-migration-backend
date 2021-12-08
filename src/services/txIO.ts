import { Pool } from "pg";
import { Request, Response } from "express";
import { TransInputFrag, TransOutputFrag } from "../Transactions/types";
import { extractAssets } from "../utils";

export const handleGetTxIO = (pool: Pool) => async (req: Request, res:Response): Promise<void> => {
  if (!req.params.tx_hash || req.params.tx_hash.trim() === "") throw new Error("missing tx_hash on request path");

  const tx_hash = req.params.tx_hash.trim();

  const tx_id = await getTxId(pool, tx_hash);

  if (tx_id === null) throw new Error("transaction can't be found");

  const [inputs, collateralInputs, outputs] = await Promise.all([
    getInputs(pool, tx_hash),
    getCollateralInputs(pool, tx_hash),
    getOutputs(pool, tx_id, tx_hash)
  ]);

  res.send({
    inputs, collateralInputs, outputs
  });
};

const getTxId = async (pool: Pool, tx_hash: string): Promise<any> => {
  const query = `
    select tx.id from tx
    where encode(tx.hash, 'hex') = $1
    limit 1`;

  const result = await pool.query(query, [tx_hash]);

  if (result.rowCount !== 1) {
    return null;
  }

  return result.rows[0].id;
};

const getInputs = async (pool: Pool, tx_hash: string): Promise<Array<TransInputFrag>> => {
  const query = `
    select * from in_addr_val_pairs(decode($1, 'hex'));`;

  const result = await pool.query(query, [tx_hash]);

  if (result.rows[0].in_addr_val_pairs === null) {
    return [];
  }

  return result.rows[0].in_addr_val_pairs.map((obj: any): TransInputFrag => ({
    address: obj.f1,
    amount: obj.f2.toString(),
    id: obj.f3.concat(obj.f4.toString()),
    index: obj.f4,
    txHash: obj.f3,
    assets: extractAssets(obj.f5)
  }));
};

const getCollateralInputs = async (pool: Pool, tx_hash: string): Promise<Array<TransInputFrag>> => {
  const query = `
    select * from collateral_in_addr_val_pairs(decode($1, 'hex'));`;

  const result = await pool.query(query, [tx_hash]);

  if (result.rows[0].collateral_in_addr_val_pairs === null) {
    return [];
  }

  return result.rows[0].collateral_in_addr_val_pairs.map((obj: any): TransInputFrag => ({
    address: obj.f1,
    amount: obj.f2.toString(),
    id: obj.f3.concat(obj.f4.toString()),
    index: obj.f4,
    txHash: obj.f3,
    assets: extractAssets(obj.f5)
  }));
};

const getOutputs = async (pool: Pool, tx_id: number, tx_hash: string): Promise<Array<TransOutputFrag>> => {
  const query = `
    select * from out_addr_val_pairs($1, decode($2, 'hex'));`;

  const result = await pool.query(query, [tx_id, tx_hash]);

  if (result.rows[0].out_addr_val_pairs === null) {
    return [];
  }

  return result.rows[0].out_addr_val_pairs.map((obj: any): TransOutputFrag => ({
    address: obj.f1,
    amount: obj.f2.toString(),
    assets: extractAssets(obj.f3)
  }));
};
