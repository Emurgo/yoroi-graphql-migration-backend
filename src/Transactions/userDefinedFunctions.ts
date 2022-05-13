import { Pool } from "pg";

const transactionUtilityFunctionsSql = `
CREATE OR REPLACE FUNCTION tx_metadata_agg (_tx_id BIGINT) RETURNS json AS $$
BEGIN
    RETURN (
        SELECT jsonb_object_agg(key, bytes)
        FROM tx_metadata
        WHERE tx_metadata.tx_id = _tx_id
    );
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION withdraws_agg (_tx_id BIGINT) RETURNS json AS $$
BEGIN
    RETURN (
        SELECT json_agg((encode(addr."hash_raw",'hex'), "amount") order by w."id" asc)
        FROM withdrawal as w
            JOIN stake_address as addr on addr.id = w.addr_id
        WHERE tx_id = _tx_id
    );
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION certificates_agg (_tx_id BIGINT) RETURNS json AS $$
BEGIN
    RETURN (
        SELECT json_agg(row_to_json(certs) order by "certIndex" asc)
        FROM combined_certificates certs
        WHERE certs."txId" = _tx_id
    );
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION block_era_from_vrf_key (_vrf_key VARCHAR) RETURNS varchar AS $$
BEGIN
    RETURN CASE
        when _vrf_key is null then 'byron'
        else 'shelley'
    END;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION in_addr_val_pairs(_tx_hash hash32type) RETURNS json AS $$
BEGIN
    RETURN (
        SELECT json_agg(
            (source_tx_out.address
            , source_tx_out.value
            , encode(source_tx.hash, 'hex')
            , tx_in.tx_out_index
            , (
                SELECT json_agg(ROW(encode("policy", 'hex'), encode("name", 'hex'), "quantity"))
                FROM ma_tx_out
                inner join multi_asset on ma_tx_out.ident = multi_asset.id
                WHERE ma_tx_out."tx_out_id" = source_tx_out.id
            )) order by tx_in.id asc) as inAddrValPairs
        FROM tx inadd_tx
            JOIN tx_in ON tx_in.tx_in_id = inadd_tx.id
            JOIN tx_out source_tx_out
                ON tx_in.tx_out_id = source_tx_out.tx_id
                    AND tx_in.tx_out_index::smallint = source_tx_out.index::smallint
            JOIN tx source_tx ON source_tx_out.tx_id = source_tx.id
        WHERE inadd_tx.hash = _tx_hash
    );
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION collateral_in_addr_val_pairs(_tx_hash hash32type) RETURNS json AS $$
BEGIN
    RETURN (
        SELECT json_agg(
            (source_tx_out.address
            , source_tx_out.value
            , encode(source_tx.hash, 'hex')
            , collateral_tx_in.tx_out_index
            , (
                SELECT json_agg(ROW(encode("policy", 'hex'), encode("name", 'hex'), "quantity"))
                FROM ma_tx_out
                inner join multi_asset on ma_tx_out.ident = multi_asset.id
                WHERE ma_tx_out."tx_out_id" = source_tx_out.id
            )) order by collateral_tx_in.id asc) as collateralInAddrValPairs
        FROM tx inadd_tx
            JOIN collateral_tx_in ON collateral_tx_in.tx_in_id = inadd_tx.id
            JOIN tx_out source_tx_out
                ON collateral_tx_in.tx_out_id = source_tx_out.tx_id
                    AND collateral_tx_in.tx_out_index::smallint = source_tx_out.index::smallint
            JOIN tx source_tx ON source_tx_out.tx_id = source_tx.id
        WHERE inadd_tx.hash = _tx_hash
    );
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION out_addr_val_pairs(_tx_id BIGINT, _tx_hash hash32type) RETURNS json AS $$
BEGIN
    RETURN (
        SELECT json_agg(
            ("address"
            , "value"
            , encode("txDataHash", 'hex')
            , (
                SELECT json_agg(ROW(encode("policy", 'hex'), encode("name", 'hex'), "quantity"))
                FROM ma_tx_out
                    JOIN multi_asset on ma_tx_out.ident = multi_asset.id
                    JOIN tx_out token_tx_out ON token_tx_out.tx_id = _tx_id
                WHERE ma_tx_out."tx_out_id" = token_tx_out.id
                  AND hasura_to."address" = token_tx_out.address
                  AND hasura_to.index = token_tx_out.index)
            ) order by "index" asc) as outAddrValPairs
        FROM "TransactionOutput" hasura_to
        WHERE hasura_to."txHash" = _tx_hash
    );
END;
$$ LANGUAGE plpgsql;
`;

export const createTransactionUtilityFunctions = (pool: Pool): void => {
  if (process.env.NODE_TYPE !== "slave") {
    pool.query(transactionUtilityFunctionsSql);
  }
};
