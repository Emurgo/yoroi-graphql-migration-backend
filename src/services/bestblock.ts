import { Pool } from "pg";

import { UtilEither } from "../utils";

import { CardanoFrag } from "../Transactions/types";

export const askBestBlock = async (
  pool: Pool
): Promise<UtilEither<CardanoFrag>> => {
  const query = `
  SELECT epoch_no AS "epoch",
    epoch_slot_no AS "slot",
    encode(hash, 'hex') as hash,
    block_no AS height
  FROM BLOCK
  ORDER BY id DESC
  LIMIT 1;
`;

  const bestBlock = await pool.query(query);
  return { kind: "ok", value: bestBlock.rows[0] };
};
