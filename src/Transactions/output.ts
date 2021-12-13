import { Pool } from "pg";

export const createTransactionOutputViewSql = `
DROP VIEW if exists TransactionOutput;
CREATE VIEW "TransactionOutput" AS  SELECT tx_out.address,
    tx_out.value,
    tx.hash AS "txHash",
    tx_out.index
   FROM tx
     JOIN tx_out ON tx.id = tx_out.tx_id;
`;

export const createTransactionOutputView = (pool: Pool): void => {
  if (process.env.NODE_TYPE !== "slave") {
    pool.query(createTransactionOutputViewSql);
  }
};
