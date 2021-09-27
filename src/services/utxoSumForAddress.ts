import {errMsgs, UtilEither} from "../utils";
import {Pool} from "pg";
import { UtxoSumResponse } from "../Transactions/types";

export const askUtxoSumForAddresses = async (pool: Pool, addresses: string[]): Promise<UtilEither<UtxoSumResponse>> => {
  // TODO: support for payment keys
    const adaQuery = `
      SELECT "public"."utxo_view"."value" AS "value"
      FROM "public"."utxo_view"
      WHERE "public"."utxo_view"."address" = any(($1)::varchar array)
      GROUP BY "public"."utxo_view"."value"
      ORDER BY "public"."utxo_view"."value" ASC
    `;

    const tokensQuery = `
      SELECT SUM(quantity) amount,
        encode(ma_utxo.policy, 'hex') as policy,
        convert_from(ma_utxo.name, 'UTF8') as name
      FROM utxo_view utxo
        INNER JOIN ma_tx_out ma_utxo ON utxo.id = ma_utxo.tx_out_id
      WHERE address = any(($1)::varchar array)
      GROUP BY
        ma_utxo.policy,
        ma_utxo.name;
    `;

    if(addresses.length == 0)
        return {kind:"error", errMsg: errMsgs.noValue};

    try {
        const res = await pool.query(adaQuery, [addresses]);
        const totalAda = res.rows.length > 0 ? res.rows[0].value : "0";

        const tokensRes = await pool.query(tokensQuery, [addresses]);

        return {
            kind:"ok",
            value: {
              sum: totalAda,
              totalAda: totalAda,
              tokensBalance: tokensRes.rows
                .map(r => {
                  return {
                    amount: r.amount,
                    name: r.name,
                    policy: r.policy
                  };
                })
            },
        };
    } catch (err: any) {
        const errString = err.stack + "";
        return {kind:"error", errMsg: "askUtxoSumForAddresses error: " + errString};
    }
};
