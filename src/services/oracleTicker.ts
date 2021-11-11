import { Pool } from "pg";

import { Request, Response } from "express";

export interface Ticker {
  [address: string]: {
    ticker: string;
    latestBlock: number;
  };
}

interface Dictionary<T> {
  [addresses: string]: T;
}

export const handleOracleTicker =
  (p: Pool) =>
  async (req: Request, res: Response): Promise<void> => {
    const addresses = req.body.addresses; // list of trusted oracles

    if (!addresses || addresses.length === 0) {
      throw new Error("Addresses of trusted oracles is missing");
    }

    const ret: Dictionary<Ticker[]> = {};

    const queryMetadataOracle = `
      SELECT
        keys.address AS "address",
        keys.ticker AS "ticker",
        (
          SELECT b.block_no AS "latestBlock"
          FROM tx
            JOIN block b ON (b.id = tx.block_id)
          WHERE tx.id = latest
        ) AS "latestBlock"
      FROM (
          SELECT
            txo.address AS "address",
            jsonb_object_keys(txm.json) AS "ticker",
            MAX(txm.tx_id) AS "latest"
          FROM tx_out txo
            JOIN tx_metadata txm ON (txo.tx_id = txm.tx_id)
          WHERE txo.address = ANY ($1)
            AND txm.key = 1968
          GROUP BY ticker,
            txo.address
        ) AS "keys"
    `;

    const oracleTickers = await p.query(queryMetadataOracle, [addresses]);
    console.log(oracleTickers);
    oracleTickers.rows.map(async (oracleTicker) => {
      try {
        if (!ret[oracleTicker.address]) {
          ret[oracleTicker.address] = new Array<Ticker>();
        }

        ret[oracleTicker.address].push({
          ticker: oracleTicker.ticker,
          latestBlock: oracleTicker.latestBlock,
        });
      } catch (err) {
        console.log("Error when processing oracle tickers. Message:", err);
      }
    });

    res.send(ret);
  };
