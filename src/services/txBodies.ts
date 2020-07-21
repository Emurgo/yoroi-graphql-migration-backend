import { Pool } from "pg";

const askBodiesQuery = `
 select hash, body
 from tx_body
 where encode(hash,'hex') = any(($1))`;

export interface BodyRow {
  hash: string;
  body: string;
}

// this should be graphql.
// but I haven't brought our dependencies up to master yet
// and I didn't want to fork yet again.  also this is quicker than forking
// and time is stressed right now!

export const askTxBodies = async (
  pool: Pool
  , hashes: Set<string>) : Promise<BodyRow[]> => {
  const ret = await pool.query(askBodiesQuery, [ [...hashes]]);
  return ret.rows.map( (row: any) => ({ hash: row.hash.toString("hex"), body: row.body.toString("hex")}));
};
