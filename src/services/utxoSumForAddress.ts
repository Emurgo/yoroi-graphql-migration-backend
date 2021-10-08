import {errMsgs, UtilEither} from "../utils";
import {Pool} from "pg";

export const askUtxoSumForAddresses = async (pool: Pool, addresses: string[]): Promise<UtilEither<string>> => {
  // TODO: support for payment keys
  const sqlQuery = `
  SELECT SUM(tx_out.value) As value
    FROM tx
    INNER JOIN tx_out ON tx.id = tx_out.tx_id
  JOIN block
      ON block.id = tx.block_id
    WHERE tx.valid_contract -- utxos only from valid txs
    -- exclude collateral inputs spent in invalid txs
    AND NOT EXISTS (
      SELECT true
        FROM collateral_tx_in
      LEFT JOIN tx as collateral_tx
        ON collateral_tx_in.tx_in_id = collateral_tx.id
      WHERE collateral_tx.valid_contract = 'false' -- collateral was burned
      AND tx_out.tx_id = collateral_tx_in.tx_out_id
      AND tx_out.index = collateral_tx_in.tx_out_index
    )
    -- exclude tx outputs used as tx input in valid tx
    AND NOT EXISTS (
      SELECT true
        FROM tx_in -- utxos attempted to be used as input in valid txs
        LEFT JOIN tx as input_tx
          ON tx_in.tx_in_id = input_tx.id
        WHERE input_tx.valid_contract -- input comes from a valid tx
        AND tx_out.tx_id = tx_in.tx_out_id
        AND tx_out.index = tx_in.tx_out_index
    )
    AND tx_out.address = any(($1)::varchar array)
  `;

    if(addresses.length == 0)
        return {kind:"error", errMsg: errMsgs.noValue};

    try {
        const res = await pool.query(sqlQuery, [addresses]);
        const value = res.rows.length > 0 ? res.rows[0].value : "0";
        return {
            kind:"ok",
            value,
        };
    } catch (err: any) {
        const errString = err.stack + "";
        return {kind:"error", errMsg: "askUtxoSumForAddresses error: " + errString};
    }
};
