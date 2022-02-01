import { Pool } from "pg";

import { UtilEither } from "../utils";

export interface CardanoFrag {
  behindby: number;
}

export const askBehindBy = async (
  pool: Pool
): Promise<UtilEither<CardanoFrag>> => {
  const query = `
  select EXTRACT(EPOCH FROM (now() - max(time))) as behindBy from block;
`;

  const behindBy = await pool.query(query);
  return { kind: "ok", value: behindBy.rows[0] };
};
