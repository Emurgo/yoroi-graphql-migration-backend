import { Pool } from "pg";

import { UtilEither} from "../utils";

export interface CardanoFrag {
  behindby: {
    years?: number,
    months?: number,
    days?: number,
    hours?: number,
    minutes?: number,
    seconds?: number,
  };
}

export const askBehindBy = async (pool: Pool) : Promise<UtilEither<CardanoFrag>> => {
  const query = `
  select now() - max(time) as behindBy from block;
`;

const behindBy = await pool.query(query);
return { kind: "ok", value: behindBy.rows[0] };
};

