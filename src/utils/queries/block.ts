import { Pool } from "pg";

import { BlockFrag } from "../../Transactions/types";
import { SAFE_BLOCK_DEPTH } from "../../services/tipStatus";
import { PoolOrClient } from "../index";

const baseGetBlockQuery = `SELECT encode(hash, 'hex') as hash,
  epoch_no,
  slot_no,
  block_no
FROM block`;

export const getLatestBlock = async (pool: Pool): Promise<BlockFrag> => {
  const result = await pool.query(
    `${baseGetBlockQuery}
    WHERE block_no = (SELECT MAX(block_no) FROM block)`
  );

  if (!result.rows || result.rows.length === 0) {
    throw new Error("error, no blocks found at all!");
  }

  const row = result.rows[0];

  return {
    epochNo: row.epoch_no,
    hash: row.hash,
    slotNo: row.slot_no,
    number: row.block_no,
  };
};

export const getBlock =
  (pool: PoolOrClient) =>
  async (hash: string): Promise<BlockFrag | undefined> => {
    const result = await pool.query(
      `${baseGetBlockQuery}
    WHERE hash = decode($1, 'hex')`,
      [hash]
    );

    if (!result.rows || result.rows.length === 0) {
      return undefined;
    }

    const row = result.rows[0];

    return {
      epochNo: row.epoch_no,
      hash: row.hash,
      slotNo: row.slot_no,
      number: row.block_no,
    };
  };

export const getLatestBestBlockFromHashes =
  (pool: PoolOrClient) =>
  async (hashes: Array<string>): Promise<BlockFrag | undefined> => {
    const result = await pool.query(
      `${baseGetBlockQuery}
    WHERE hash in (
      select decode(n, 'hex') from unnest(($1)::varchar array) as n
    ) ORDER BY block_no DESC limit 1`,
      [hashes]
    );

    if (!result.rows || result.rows.length === 0) {
      return undefined;
    }

    const row = result.rows[0];

    return {
      epochNo: row.epoch_no,
      hash: row.hash,
      slotNo: row.slot_no,
      number: row.block_no,
    };
  };

export const getLatestSafeBlockFromHashes =
  (pool: PoolOrClient) =>
  async (hashes: Array<string>): Promise<BlockFrag | undefined> => {
    const result = await pool.query(
      `${baseGetBlockQuery}
    WHERE hash in (
      select decode(n, 'hex') from unnest(($1)::varchar array) as n
    ) AND block_no <= (SELECT MAX(block_no) FROM block) - ($2)::int
    ORDER BY block_no DESC limit 1`,
      [hashes, SAFE_BLOCK_DEPTH]
    );

    if (!result.rows || result.rows.length === 0) {
      return undefined;
    }

    const row = result.rows[0];

    return {
      epochNo: row.epoch_no,
      hash: row.hash,
      slotNo: row.slot_no,
      number: row.block_no,
    };
  };
