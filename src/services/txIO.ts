import { Pool } from "pg";
import { Request, Response } from "express";
import { TransInputFrag, TransOutputFrag } from "../Transactions/types";
import { extractAssets } from "../utils";

export const handleGetTxIO =
  (pool: Pool) =>
  async (req: Request, res: Response): Promise<void> => {
    if (!req.params.tx_hash || req.params.tx_hash.trim() === "")
      throw new Error("missing tx_hash on request path");

    const tx_hash = req.params.tx_hash.trim();

    const result = await pool.query(query, [tx_hash]);

    if (result.rowCount !== 1) {
      throw new Error("transaction can't be found");
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

const query = `
  select 
    in_addr_val_pairs(tx.hash),
    collateral_in_addr_val_pairs(tx.hash),
    out_addr_val_pairs(tx.id, tx.hash)
  from tx
  where encode(tx.hash, 'hex') = $1
  limit 1;`;
