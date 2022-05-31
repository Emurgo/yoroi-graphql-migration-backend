import type { Pool, Client } from "pg";
import type { Ticker } from "./types";

export function createTickersTable(db: Pool | Client) {
  return db.query(`
    CREATE TABLE tickers(
     "from"  varchar(10) NOT NULL,
     time  bigint NOT NULL,
     signature bytea,
     prices  jsonb NOT NULL
    );
    CREATE INDEX ON tickers (time);
  `);
}

export function dropTickersTable(db: Pool) {
  return db.query("DROP TABLE tickers;");
}

function rowToTicker(row: any): Ticker {
  return {
    from: row.from,
    timestamp: row.time * 1000,
    signature: row.signature.toString("hex"),
    prices: row.prices,
  };
}

export async function getLatestTicker(
  db: Pool | Client,
  fromCurrency: string
): Promise<Ticker> {
  return (
    await db.query({
      text: 'SELECT * from tickers WHERE "from"=$1 ORDER BY time DESC LIMIT 1',
      values: [fromCurrency],
    })
  ).rows.map(rowToTicker)[0];
}

export async function getTickers(
  db: Pool,
  fromCurrency: string,
  timestamps: Array<number>
): Promise<Array<Ticker>> {
  const timeValues = await Promise.all(
    timestamps.map(async (timestamp) => {
      const time = Math.floor(timestamp / 1000);
      const result = await db.query({
        text:
          'SELECT "time" FROM tickers ' +
          'WHERE time<=$1 AND "from"=$2' +
          "ORDER BY time DESC " +
          "LIMIT 1;",
        values: [time, fromCurrency],
      });
      return result.rows[0].time;
    })
  );

  return (
    await db.query({
      text: 'SELECT * from tickers WHERE "from"=$1 AND time=ANY($2::bigint[])',
      values: [fromCurrency, timeValues],
    })
  ).rows.map(rowToTicker);
}

export async function insertTicker(
  db: Pool | Client,
  ticker: Ticker
): Promise<void> {
  await db.query({
    text: 'INSERT INTO tickers("from", time, signature, prices) VALUES ($1, $2, $3, $4)',
    values: [
      ticker.from,
      Math.floor(ticker.timestamp / 1000),
      Buffer.from(ticker.signature || "00" /* to please flow */, "hex"),
      JSON.stringify(ticker.prices),
    ],
  });
}
