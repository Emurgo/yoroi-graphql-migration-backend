import { Pool, } from "pg";

export const createViewSql = `
drop view if exists valid_utxos_view;
create view valid_utxos_view as
SELECT
  tx_out.address
  , tx_out.payment_cred
  , encode(tx.hash,'hex') as hash
  , tx_out.index
  , tx_out.value
  , block.block_no as "blockNumber"
  , (
    select json_agg(ROW (encode("policy", 'hex'), encode("name", 'hex'), "quantity"))
    from ma_tx_out
    WHERE ma_tx_out."tx_out_id" = tx_out.id
  ) as assets
FROM tx
  INNER JOIN tx_out ON tx.id = tx_out.tx_id
  INNER JOIN block ON block.id = tx.block_id
WHERE tx.valid_contract -- utxos only from valid txs
  -- exclude collateral inputs spent in invalid txs
  AND NOT EXISTS (
    SELECT true
    FROM collateral_tx_in
      LEFT JOIN tx as collateral_tx ON collateral_tx_in.tx_in_id = collateral_tx.id
    WHERE collateral_tx.valid_contract = 'false' -- collateral was burned
      AND tx_out.tx_id = collateral_tx_in.tx_out_id
      AND tx_out.index = collateral_tx_in.tx_out_index
  )
-- exclude tx outputs used as tx input in valid tx
  AND NOT EXISTS (
    SELECT true
    FROM tx_in -- utxos attempted to be used as input in valid txs
      LEFT JOIN tx as input_tx ON tx_in.tx_in_id = input_tx.id
    WHERE input_tx.valid_contract -- input comes from a valid tx
      AND tx_out.tx_id = tx_in.tx_out_id
      AND tx_out.index = tx_in.tx_out_index)`;

export const createValidUtxosView = (pool: Pool): void => {
  if(process.env.NODE_TYPE !== "slave"){
    pool.query(createViewSql);
  }
};
