import {errMsgs, UtilEither} from "../utils";
import {Pool} from "pg";

export const askUtxoSumForAddresses = async (pool: Pool, addresses: string[]): Promise<UtilEither<string>> => {
  // TODO: support for payment keys
    const sqlQuery = `
    SELECT "public"."utxo_view"."value" AS "value"
    FROM "public"."utxo_view"
    WHERE "public"."utxo_view"."address" = any(($1)::varchar array)
    GROUP BY "public"."utxo_view"."value"
    ORDER BY "public"."utxo_view"."value" ASC
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
    } catch (err) {
        const errString = err.stack + "";
        return {kind:"error", errMsg: "askUtxoSumForAddresses error: " + errString};
    }
};
