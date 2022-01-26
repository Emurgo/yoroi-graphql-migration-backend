import config from "config";

import { Pool } from "pg";
import { Request, Response } from "express";

const SAFE_BLOCK_DEPTH = parseInt(config.get("safeBlockDifference"));

const bestBlockQuery = `
  SELECT epoch_no AS "epoch",
    epoch_slot_no AS "slot",
    slot_no AS "globalSlot",
    encode(hash, 'hex') as hash,
    block_no AS height
  FROM BLOCK
  ORDER BY id DESC
  LIMIT 1;`;

const safeBlockQuery = `SELECT epoch_no AS "epoch",
  epoch_slot_no AS "slot",
  slot_no AS "globalSlot",
  encode(hash, 'hex') as hash,
  block_no AS height
FROM BLOCK
WHERE block_no <= (SELECT MAX(block_no) FROM block) - ($1)::int
ORDER BY id DESC
LIMIT 1;
`;

const bestBlockFromReferenceQuery = `SELECT encode(hash, 'hex') as "hash", block_no as "blockNumber"
    FROM block
    WHERE encode(hash, 'hex') = any(($1)::varchar array)
      AND block_no IS NOT NULL
    ORDER BY block_no DESC
    LIMIT 1`;

const safeBlockFromReferenceQuery = `SELECT encode(hash, 'hex') as "hash", block_no as "blockNumber"
  FROM block
  WHERE encode(hash, 'hex') = any(($1)::varchar array)
    AND block_no IS NOT NULL
    AND block_no <= (SELECT MAX(block_no) FROM block) - ($2)::int
  ORDER BY block_no DESC
  LIMIT 1`;

const getBestAndSafeBlocks = async (
  pool: Pool
): Promise<{
  safeBlock: string | undefined;
  bestBlock: string | undefined;
}> => {
  const [bestBlockResult, safeBlockResult] = await Promise.all([
    pool.query(bestBlockQuery),
    pool.query(safeBlockQuery, [SAFE_BLOCK_DEPTH]),
  ]);

  return {
    bestBlock: bestBlockResult.rows[0],
    safeBlock: safeBlockResult.rows[0],
  };
};

export const handleTipStatusGet =
  (pool: Pool) => async (req: Request, res: Response) => {
    const result = await getBestAndSafeBlocks(pool);
    res.send(result);
  };

export const handleTipStatusPost =
  (pool: Pool) => async (req: Request, res: Response) => {
    if (!req.body.reference) {
      throw new Error("error, missing reference");
    }

    if (!req.body.reference.bestBlocks) {
      throw new Error("error, missing bestBlocks inside reference");
    }

    const bestBlocks: string[] = req.body.reference.bestBlocks;
    if (!Array.isArray(bestBlocks)) {
      throw new Error("error, bestBlocks should be an array");
    }

    if (bestBlocks.length === 0) {
      throw new Error("error, bestBlocks should not be empty");
    }

    const [
      { safeBlock, bestBlock },
      bestBlockFromReferenceResult,
      safeBlockFromReferenceResult,
    ] = await Promise.all([
      getBestAndSafeBlocks(pool),
      pool.query(bestBlockFromReferenceQuery, [bestBlocks]),
      pool.query(safeBlockFromReferenceQuery, [
        bestBlocks,
        SAFE_BLOCK_DEPTH,
      ]),
    ]);

    if (bestBlockFromReferenceResult.rowCount === 0) {
      throw new Error("REFERENCE_POINT_BLOCK_NOT_FOUND");
    }

    const lastFoundBestBlock: string =
      bestBlockFromReferenceResult.rows[0].hash;
    if (safeBlockFromReferenceResult.rowCount === 0) {
      throw new Error("REFERENCE_POINT_BLOCK_NOT_FOUND");
    }
    const lastFoundSafeBlock: string =
      safeBlockFromReferenceResult.rows[0].hash;

    res.send({
      safeBlock,
      bestBlock,
      reference: {
        lastFoundSafeBlock,
        lastFoundBestBlock,
      },
    });
  };
