import { Pool } from "pg";

import { BlockFrag } from "../../Transactions/types";

const baseGetBlockQuery = `SELECT encode(hash, 'hex'),
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
    number: row.block_no
  };
};

export const getBlock = (pool: Pool) => async (hash: string): Promise<BlockFrag> => {
  const result = await pool.query(
    `${baseGetBlockQuery}
    WHERE encode(hash, 'hex') = ($1)::varchar`,
    [hash]
  );

  if (!result.rows || result.rows.length === 0) {
    throw new Error(`error, there's no block with the hash ${hash}!`);
  }

  const row = result.rows[0];
  
  return {
    epochNo: row.epoch_no,
    hash: row.hash,
    slotNo: row.slot_no,
    number: row.block_no
  };
};
