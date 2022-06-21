import { Pool } from "pg";

export const createTransactionOutputViewSql = `
CREATE OR REPLACE VIEW "TransactionOutput" AS  SELECT tx_out.address,
    tx_out.value,
    tx.hash AS "txHash",
    tx_out.index,
    tx_out.data_hash AS "txDataHash"
   FROM tx
     JOIN tx_out ON tx.id = tx_out.tx_id;
`;

export const createCollateralTransactionOutputViewSql = `
CREATE OR REPLACE VIEW "CollateralTransactionOutput" AS  SELECT collateral_tx_out.address,
    collateral_tx_out.value,
    tx.hash AS "txHash",
    collateral_tx_out.index,
    collateral_tx_out.data_hash AS "txDataHash"
   FROM tx
     JOIN collateral_tx_out ON tx.id = collateral_tx_out.tx_id;
`;

export const createTransactionOutputView = (pool: Pool): void => {
  if (process.env.NODE_TYPE !== "slave") {
    pool.query(createTransactionOutputViewSql);
    pool.query(createCollateralTransactionOutputViewSql);
  }
};
