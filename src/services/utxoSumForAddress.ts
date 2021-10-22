import {errMsgs, UtilEither} from "../utils";
import {Pool} from "pg";

export const askUtxoSumForAddresses = async (pool: Pool, addresses: string[]): Promise<UtilEither<string>> => {
  // TODO: support for payment keys
  const sqlQuery = `
  SELECT SUM(value) as value
  FROM valid_utxos_view
  WHERE address = any(($1)::varchar array)
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
