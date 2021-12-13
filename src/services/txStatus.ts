import { Pool } from "pg";
import { Request, Response } from "express";

const txStatusQuery = `
SELECT encode(tx.hash, 'hex') tx_id,
       (highest_block.block_no - block.block_no + 1) depth
FROM tx
    INNER JOIN block on tx.block_id = block.id
    CROSS JOIN (SELECT MAX(block_no) block_no FROM block) as highest_block
WHERE encode(tx.hash, 'hex') = any(($1)::varchar array);
`;

export const handleTxStatus = (pool: Pool) => async (req: Request, res: Response) => {
  if(!req.body || !req.body.txHashes) {
    throw new Error("error, no tx txHashes informed.");
  }
  if (!Array.isArray(req.body.txHashes)) {
    throw new Error("'txHashes' should be an array.");
  }
  const txHashes: string[] = req.body.txHashes;
  if (txHashes.length > 100) {
    throw new Error("Max limit of 100 tx txHashes exceeded.");
  }
  if (txHashes.length === 0) {
    throw new Error("error, at least 1 tx id should be informed.");
  }

  const result = await pool.query(txStatusQuery, [txHashes]);

  const depth: {[key: string]: number} = {};

  for (const item of result.rows) {
    depth[item.tx_id] = item.depth;
  }

  res.send({ depth });
};