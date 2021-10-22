import {errMsgs, UtilEither} from "../utils";
import {Pool} from "pg";
import { UtxoSumResponse } from "../Transactions/types";

export const askUtxoSumForAddresses = async (pool: Pool, addresses: string[]): Promise<UtilEither<UtxoSumResponse>> => {
  // TODO: support for payment keys
  const sqlQuery = `
    SELECT SUM(value) as value
    FROM valid_utxos_view
    WHERE address = any(($1)::varchar array)
  `;

  const tokensQuery = `
    SELECT SUM(ma_utxo.quantity) amount,
      encode(ma_utxo.policy, 'hex') as policy,
      encode(ma_utxo.name, 'hex') as name
    FROM valid_utxos_view utxo
      INNER JOIN ma_tx_out ma_utxo ON utxo.id = ma_utxo.tx_out_id
    WHERE address = any(($1)::varchar array)
    GROUP BY
      ma_utxo.policy,
      ma_utxo.name;
  `;

  if(addresses.length == 0)
      return {kind:"error", errMsg: errMsgs.noValue};

  try {
      const res = await pool.query(sqlQuery, [addresses]);
      const totalAda = res.rows.length > 0 ? res.rows[0].value : "0";

      const tokensRes = await pool.query(tokensQuery, [addresses]);

      return {
          kind:"ok",
          value: {
            sum: totalAda,
            tokensBalance: tokensRes.rows
              .map(r => {
                return {
                  amount: r.amount,
                  assetId: `${r.policy}.${r.name}`
                };
              })
          },
      };
  } catch (err: any) {
      const errString = err.stack + "";
      return {kind:"error", errMsg: "askUtxoSumForAddresses error: " + errString};
  }
};
