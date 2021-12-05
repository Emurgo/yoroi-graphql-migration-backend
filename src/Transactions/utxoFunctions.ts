import { Pool } from "pg";

const sql = `DROP FUNCTION IF EXISTS utxo_used_as_valid_input;
CREATE OR REPLACE FUNCTION utxo_used_as_valid_input (
  _tx_out_tx_id bigint,
  _tx_out_index smallint,
  _reference_block_no uinteger
) RETURNS bool AS $$
BEGIN
    RETURN EXISTS((
        SELECT true AS bool
        FROM tx_in
            INNER JOIN tx ON tx_in.tx_in_id = tx.id
            INNER JOIN block ON tx.block_id = block.id
            LEFT JOIN tx input_tx ON tx_in.tx_in_id = input_tx.id
        WHERE block.block_no <= _reference_block_no
            AND input_tx.valid_contract
            AND tx_in.tx_out_id = _tx_out_tx_id
            AND tx_in.tx_out_index::smallint = _tx_out_index
    ));
END;
$$ LANGUAGE plpgsql;

DROP FUNCTION IF EXISTS utxo_used_as_invalid_collateral;
CREATE OR REPLACE FUNCTION utxo_used_as_invalid_collateral (
  _tx_out_tx_id bigint,
  _tx_out_index smallint,
  _reference_block_no uinteger
) RETURNS bool AS $$
BEGIN
    RETURN EXISTS((
        SELECT true AS bool
        FROM collateral_tx_in
            INNER JOIN tx ON collateral_tx_in.tx_in_id = tx.id
            INNER JOIN block ON tx.block_id = block.id
            LEFT JOIN tx collateral_tx ON collateral_tx_in.tx_in_id = collateral_tx.id
        WHERE block.block_no <= _reference_block_no
            AND collateral_tx.valid_contract = false
            AND collateral_tx_in.tx_out_id = _tx_out_tx_id
            AND collateral_tx_in.tx_out_index::smallint = _tx_out_index
    ));
END;
$$ LANGUAGE plpgsql;
`;

export const createUtxoFunctions = (pool: Pool): void => {
  if(process.env.NODE_TYPE !== "slave"){
    pool.query(sql);
  }
};