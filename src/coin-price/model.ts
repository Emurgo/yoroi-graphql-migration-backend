import EventEmitter from "events";
import * as dbApi from "./db-api";

import type { Pool } from "pg";
import type Logger from "bunyan";
import type { Ticker } from "./types";

const currentPriceCache: Map<string, Ticker> = new Map();
let currentPriceCacheLoadEvent: EventEmitter | undefined;

export async function getCurrentPrice(
  db: Pool,
  fromCurrency: string,
  _logger: Logger
): Promise<Ticker | undefined> {
  if (!currentPriceCache.has(fromCurrency)) {
    if (currentPriceCacheLoadEvent) {
      // Some concurrent invocation of this function is already loading the cache.
      await new Promise((resolve) => {
        if (!currentPriceCacheLoadEvent) {
          throw new Error("expect currentPriceCacheLoadEvent");
        }
        currentPriceCacheLoadEvent.once("loaded", resolve);
      });
    } else {
      // We should load the cache from DB
      currentPriceCacheLoadEvent = new EventEmitter();
      const ticker = await dbApi.getLatestTicker(db, fromCurrency);
      currentPriceCache.set(fromCurrency, ticker);
      currentPriceCacheLoadEvent.emit("loaded");
    }
  }

  return currentPriceCache.get(fromCurrency);
}

export async function getHistoricalPrice(
  db: Pool,
  fromCurrency: string,
  timestamps: Array<number>,
  _logger: Logger
): Promise<Array<Ticker>> {
  return dbApi.getTickers(db, fromCurrency, timestamps);
}

export async function insertPriceData(db: Pool, ticker: Ticker): Promise<void> {
  currentPriceCache.set(ticker.from, ticker);
  await dbApi.insertTicker(db, ticker);
}
