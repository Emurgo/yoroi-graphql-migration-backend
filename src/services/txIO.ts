import { Pool } from "pg";
import { Request, Response } from "express";
import { TransInputFrag, TransOutputFrag } from "../Transactions/types";
import { extractAssets } from "../utils";

const QUERY_IO = `
  select 
    in_addr_val_pairs(tx.hash),
    collateral_in_addr_val_pairs(tx.hash),
    out_addr_val_pairs(tx.id, tx.hash)
  from tx
  where tx.hash = decode($1, 'hex')
  limit 1;`;

const QUERY_OUT = `
  select out_addr_val_pairs(tx.id, tx.hash)->$2::int as "out"
  from tx
  where tx.hash = decode($1, 'hex')
  limit 1;`;

export const handleGetTxIO =
  (pool: Pool) =>
  async (req: Request, res: Response): Promise<void> => {
    const tx_hash = (req.params.tx_hash||"").trim();
    if (tx_hash.length <= 0) {
      res.status(400).send(`missing tx_hash on request path: [${tx_hash}]`);
      return;
    }

    const result = await pool.query(QUERY_IO, [tx_hash]);

    if (result.rowCount === 0) {
      res.status(404).send("Transaction not found");
      return;
    }

    const inputs = result.rows[0].in_addr_val_pairs || [];
    const collateralInputs = result.rows[0].collateral_in_addr_val_pairs || [];
    const outputs = result.rows[0].out_addr_val_pairs || [];

    res.send({
      inputs: inputs.map(
        (obj: any): TransInputFrag => ({
          address: obj.f1,
          amount: obj.f2.toString(),
          id: obj.f3.concat(obj.f4.toString()),
          index: obj.f4,
          txHash: obj.f3,
          assets: extractAssets(obj.f5),
        })
      ),
      collateralInputs: collateralInputs.map(
        (obj: any): TransInputFrag => ({
          address: obj.f1,
          amount: obj.f2.toString(),
          id: obj.f3.concat(obj.f4.toString()),
          index: obj.f4,
          txHash: obj.f3,
          assets: extractAssets(obj.f5),
        })
      ),
      outputs: outputs.map(
        (obj: any): TransOutputFrag => ({
          address: obj.f1,
          amount: obj.f2.toString(),
          dataHash: obj.f3,
          assets: extractAssets(obj.f4),
        })
      ),
    });
  };

export const handleGetTxOutput =
  (pool: Pool) =>
    async (req: Request, res: Response): Promise<void> => {
      const tx_hash = (req.params.tx_hash||"").trim();
      const output_index = parseInt(req.params.index);
      if (tx_hash.length <= 0) {
        res.status(400).send(`missing tx_hash on request path: [${tx_hash}]`);
        return;
      }
      if (output_index == null || !(output_index >= 0)) {
        res.status(400).send(`missing or incorrect index on request path: [${output_index}]`);
        return;
      }

      const result = await pool.query(QUERY_OUT, [tx_hash, output_index]);

      if (result.rowCount === 0) {
        res.status(404).send("Transaction not found");
        return;
      }

      const obj = result.rows[0].out;

      if (obj == null) {
        res.status(400).send("Output index out of bounds");
        return;
      }

      res.send({
        output: {
          address: obj.f1,
          amount: obj.f2.toString(),
          dataHash: obj.f3,
          assets: extractAssets(obj.f4),
        },
      });
    };
