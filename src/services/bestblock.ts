import { Pool } from "pg";

import { shouldUseYoroiDb, UtilEither } from "../utils";

import { CardanoFrag } from "../Transactions/types";

export const askBestBlock = async (
  pool: Pool,
  yoroiDbPool: Pool
): Promise<UtilEither<CardanoFrag>> => {
  if (await shouldUseYoroiDb(yoroiDbPool)) {
    const query = `
          SELECT block__epoch_no as "epoch",
          block__epoch_slot_no as "slot",
          block__slot_no as "globalSlot",
          block__hash as "hash",
          block__block_no as "height"
      FROM history_tx
      WHERE block__block_no = (SELECT MAX(block__block_no) FROM history_tx)
    `;

    const bestBlock = await yoroiDbPool.query(query);
    return { kind: "ok", value: bestBlock.rows[0] };
  }

  const query = `
  SELECT epoch_no AS "epoch",
    epoch_slot_no AS "slot",
    slot_no AS "globalSlot",
    encode(hash, 'hex') as hash,
    block_no AS height
  FROM BLOCK
  ORDER BY id DESC
  LIMIT 1;
`;

  const bestBlock = await pool.query(query);
  return { kind: "ok", value: bestBlock.rows[0] };
};
