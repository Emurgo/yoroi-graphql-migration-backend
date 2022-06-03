import * as dbApi from "./db-api";

import type { Pool } from "pg";
import type Logger from "bunyan";
import type { Ticker } from "./types";

const currentPriceCache: Map<string, Promise<Ticker | undefined>> = new Map();
const CACHE_LIFETIME = 5 * 60 * 1000;

export async function getCurrentPrice(
  db: Pool,
  fromCurrency: string,
  _logger: Logger
): Promise<Ticker | undefined> {
  if (currentPriceCache.has(fromCurrency)) {
    const ticker = await currentPriceCache.get(fromCurrency);
    if (ticker && Date.now() - ticker.timestamp < CACHE_LIFETIME) {
      return ticker;
    }
  }
  const promise = dbApi.getLatestTicker(db, fromCurrency);
  currentPriceCache.set(fromCurrency, promise);
  return promise;
}

export async function getHistoricalPrice(
  db: Pool,
  fromCurrency: string,
  timestamps: Array<number>,
  _logger: Logger
): Promise<Array<Ticker>> {
  return dbApi.getTickers(db, fromCurrency, timestamps);
}
