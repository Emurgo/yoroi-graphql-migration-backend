import { Pool } from "pg";

type TransactionRow = {
  id: string,
  hash: string,
  blockId: string,
  blockIndex: number,
  outSum: string,
  fee: string,
  deposit: string,
  size: number,
};

export const getTransactionRowByHash =
  (pool: Pool) =>
  async (hash: string): Promise<TransactionRow | undefined> => {
    const result = await pool.query(
      "select * from tx where hash = decode($1, 'hex')",
      [hash]
    );

    if (!result.rows || result.rows.length === 0) {
      return undefined;
    }

    const row = result.rows[0];

    return {
      id: row.id,
      hash: row.hash.toString("hex"),
      blockId: row.block_id,
      blockIndex: row.block_index,
      outSum: row.out_sum,
      fee: row.fee,
      deposit: row.deposit,
      size: row.size,
    };
  };