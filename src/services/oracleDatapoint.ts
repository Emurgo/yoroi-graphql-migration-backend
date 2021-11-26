import { Pool } from "pg";

import { Request, Response } from "express";

interface Datapoint {
  [address: string]: {
    blockNumber: number;
    blockDistance: number | null; // null if block parameter is not used
    txHash: string;
    txIndex: number;
    payload: any;
  };
}

interface Dictionary<T> {
  [addresses: string]: T;
}

const queryMetadataOracle = `
  SELECT *
  FROM
    (
      -- newer than queried block
      (
        SELECT
          txo.address as "address",
          b.block_no AS "blockNumber",
          CASE
            WHEN $3::INTEGER IS NOT NULL THEN (block_no - $3)
          END AS "blockDistance",
          encode(tx.hash, 'hex') AS "txHash",
          tx.block_index AS "txIndex",
          CASE
            WHEN $2::TEXT IS NOT NULL THEN (txm.json->$2) -- if no ticker is specified, return all tickers
            ELSE txm.json
          END AS "payload"
        FROM tx_out txo
          JOIN tx_metadata txm ON (txo.tx_id = txm.tx_id)
          JOIN tx ON (tx.id = txm.tx_id)
          JOIN block b ON (b.id = tx.block_id)
        WHERE
          txo.address = ANY ($1)
          AND txm.key = 1968
          AND CASE
            WHEN $2::TEXT IS NOT NULL THEN (txm.json->$2) IS NOT NULL
            ELSE true
          END
          AND CASE
            WHEN $3::INTEGER IS NOT NULL THEN block_no >= $3 IS NOT NULL
            ELSE true
          END
        GROUP BY
          txo.address,
          tx.hash,
          b.block_no,
          tx.block_index,
          txm.json
        ORDER BY (
            CASE
              WHEN $3::INTEGER IS NOT NULL THEN (block_no - $3)
            END
          ) ASC,
          -- if a block is specified, order by nearest first
          (
            CASE
              WHEN $3::INTEGER IS NULL THEN block_no
            END
          ) DESC -- if a block is not specified, order by newest data
        LIMIT CASE
            -- default limit to 1 result, max 10
            WHEN $4 >= 1
            AND $4 <= 10 THEN $4
            ELSE 1
          END
      )
      UNION
      -- older than queried block
      (
        SELECT
          txo.address as "address",
          b.block_no AS "blockNumber",
          CASE
            WHEN $3::INTEGER IS NOT NULL THEN ($3 - block_no)
          END AS "blockDistance",
          encode(tx.hash, 'hex') AS "txHash",
          tx.block_index AS "txIndex",
          CASE
            WHEN $2::TEXT IS NOT NULL THEN (txm.json->$2) -- if no ticker is specified, return all tickers
            ELSE txm.json
          END AS "payload"
        FROM tx_out txo
          JOIN tx_metadata txm ON (txo.tx_id = txm.tx_id)
          JOIN tx ON (tx.id = txm.tx_id)
          JOIN block b ON (b.id = tx.block_id)
        WHERE
          txo.address = ANY ($1)
          AND txm.key = 1968
          AND CASE
            WHEN $2::TEXT IS NOT NULL THEN (txm.json->$2) IS NOT NULL
            ELSE true
          END
          AND CASE
            WHEN $3::INTEGER IS NOT NULL THEN block_no < $3 IS NOT NULL
            ELSE true
          END
        GROUP BY
          txo.address,
          tx.hash,
          b.block_no,
          tx.block_index,
          txm.json
        ORDER BY (
            CASE
              WHEN $3::INTEGER IS NOT NULL THEN ABS($3 - block_no)
            END
          ) ASC,
          -- if a block is specified, order by nearest first
          (
            CASE
              WHEN $3::INTEGER IS NULL THEN block_no
            END
          ) DESC -- if a block is not specified, order by newest data
        LIMIT CASE
            -- default limit to 1 result, max 10
            WHEN $4 >= 1
            AND $4 <= 10 THEN $4
            ELSE 1
          END
      )
    ) AS "nearest_datapoints"
  ORDER BY (
      CASE
        WHEN $3::INTEGER IS NOT NULL THEN ABS($3 - "blockNumber")
      END
    ) ASC, "blockNumber" DESC,
    -- if a block is specified, order by nearest first
    (
      CASE
        WHEN $3::INTEGER IS NULL THEN "blockNumber"
      END
    ) DESC -- if a block is not specified, order by newest data
  LIMIT CASE
      -- default limit to 1 result, max 10
      WHEN $4 >= 1
      AND $4 <= 10 THEN $4
      ELSE 1
    END
`;

const queryMetadataOracleSource = `
  SELECT *
  FROM
    (
      -- newer than queried block
      (
        SELECT
          txo.address as "address",
          b.block_no AS "blockNumber",
          CASE
            WHEN $3::INTEGER IS NOT NULL THEN (block_no - $3)
          END AS "blockDistance",
          encode(tx.hash, 'hex') AS "txHash",
          tx.block_index AS "txIndex",
          source AS "payload"
        FROM tx_out txo
          JOIN tx_metadata txm ON (txo.tx_id = txm.tx_id)
          JOIN tx ON (tx.id = txm.tx_id)
          JOIN block b ON (b.id = tx.block_id)
          CROSS JOIN jsonb_array_elements(txm.json->$2) source
        WHERE
          txo.address = ANY ($1)
          AND txm.key = 1968
          AND (txm.json->$2) IS NOT NULL
          AND CASE
            WHEN $3::INTEGER IS NOT NULL THEN block_no >= $3 IS NOT NULL
            ELSE true
          END
          AND source->>'source' = $4
        GROUP BY
          txo.address,
          tx.hash,
          b.block_no,
          tx.block_index,
          txm.json,
          source.*
        ORDER BY (
            CASE
              WHEN $3::INTEGER IS NOT NULL THEN (block_no - $3)
            END
          ) ASC,
          -- if a block is specified, order by nearest first
          (
            CASE
              WHEN $3::INTEGER IS NULL THEN block_no
            END
          ) DESC -- if a block is not specified, order by newest data
        LIMIT CASE
            -- default limit to 1 result, max 10
            WHEN $5 >= 1
            AND $5 <= 10 THEN $5
            ELSE 1
          END
      )
      UNION
      -- older than queried block
      (
        SELECT
          txo.address as "address",
          b.block_no AS "blockNumber",
          CASE
            WHEN $3::INTEGER IS NOT NULL THEN (block_no - $3)
          END AS "blockDistance",
          encode(tx.hash, 'hex') AS "txHash",
          tx.block_index AS "txIndex",
          source AS "payload"
        FROM tx_out txo
          JOIN tx_metadata txm ON (txo.tx_id = txm.tx_id)
          JOIN tx ON (tx.id = txm.tx_id)
          JOIN block b ON (b.id = tx.block_id)
          CROSS JOIN jsonb_array_elements(txm.json->$2) source
        WHERE
          txo.address = ANY ($1)
          AND txm.key = 1968
          AND (txm.json->$2) IS NOT NULL
          AND CASE
            WHEN $3::INTEGER IS NOT NULL THEN block_no < $3 IS NOT NULL
            ELSE true
          END
          AND source->>'source' = $4
        GROUP BY
          txo.address,
          tx.hash,
          b.block_no,
          tx.block_index,
          source.*
        ORDER BY (
            CASE
              WHEN $3::INTEGER IS NOT NULL THEN ABS($3 - block_no)
            END
          ) ASC,
          -- if a block is specified, order by nearest first
          (
            CASE
              WHEN $3::INTEGER IS NULL THEN block_no
            END
          ) DESC -- if a block is not specified, order by newest data
        LIMIT CASE
            -- default limit to 1 result, max 10
            WHEN $5 >= 1
            AND $5 <= 10 THEN $5
            ELSE 1
          END
      )
    ) AS "nearest_datapoints"
  ORDER BY (
      CASE
        WHEN $3::INTEGER IS NOT NULL THEN ABS($3 - "blockNumber")
      END
    ) ASC, "blockNumber" DESC,
    -- if a block is specified, order by nearest first
    (
      CASE
        WHEN $3::INTEGER IS NULL THEN "blockNumber"
      END
    ) DESC -- if a block is not specified, order by newest data
  LIMIT CASE
      -- default limit to 1 result, max 10
      WHEN $5 >= 1
      AND $5 <= 10 THEN $5
      ELSE 1
    END
`;

export const handleOracleDatapoint =
  (p: Pool) =>
  async (req: Request, res: Response): Promise<void> => {
    const addresses = req.body.addresses; // list of trusted oracles
    const ticker = req.body.ticker; // data point
    const block = req.body.block; // block to which we should find the nearest data, in case of a draw we display newer
    const source = req.body.source; // payload source
    const count = req.body.count; // number of total closest/most recent results, not per oracle. If you want per oracle results, query a single oracle address

    if (!addresses || addresses.length === 0) {
      throw new Error("Addresses of trusted oracles is missing");
    }

    const ret: Dictionary<Datapoint[]> = {};

    const metadataOracle = await p.query(queryMetadataOracle, [
      addresses, // mandatory, list of trusted oracles
      ticker, // optional. If not set, fetch all available tickers. If set, fetch only that ticker
      block, // optional. If not set, fetch latest `count` data and order desc. If set, find `count` nearest values around that block
      count, // optional, default 1, max 10
    ]);

    const metadataOracleSource = await p.query(queryMetadataOracleSource, [
      addresses, // mandatory, list of trusted oracles,
      ticker, // mandatory. When filtering with source, tickers are mandatory
      block, // optional. If not set, fetch latest `count` data and order desc. If set, find `count` nearest values around that block
      source, // mandatory. Source of the data
      count, // optional, default 1, max 10
    ]);

    // if source is defined we have to use a separate query
    if (source) {
      if (!ticker || !source) {
        // tickers HAVE to be defined as well
        throw new Error(
          "Both ticker and source must be defined when filtering by source"
        );
      }

      metadataOracleSource.rows.map(async (datapoint) => {
        try {
          if (!ret[datapoint.address]) {
            ret[datapoint.address] = new Array<Datapoint>();
          }

          ret[datapoint.address].push({
            blockDistance: datapoint.blockDistance,
            blockNumber: datapoint.blockNumber,
            txHash: datapoint.txHash,
            txIndex: datapoint.txIndex,
            payload: datapoint.payload,
          });
        } catch (err) {
          console.log("Error when processing oracle datapoints. Message:", err);
        }
      });
    } else {
      metadataOracle.rows.map(async (datapoint) => {
        try {
          if (!ret[datapoint.address]) {
            ret[datapoint.address] = new Array<Datapoint>();
          }

          ret[datapoint.address].push({
            blockDistance: datapoint.blockDistance,
            blockNumber: datapoint.blockNumber,
            txHash: datapoint.txHash,
            txIndex: datapoint.txIndex,
            payload: datapoint.payload,
          });
        } catch (err) {
          console.log("Error when processing oracle datapoints. Message:", err);
        }
      });
    }

    res.send(ret);
  };
