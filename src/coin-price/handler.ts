import Logger from "bunyan";
import config from "config";
import constants from "./constants";
import { getCurrentPrice, getHistoricalPrice } from "./model";

import type { Request, Response } from "express";
import type { Pool } from "pg";

async function currentPrice(
  db: Pool,
  logger: Logger,
  req: Request,
  res: Response
): Promise<void> {
  if (!constants.fromCurrencies.includes(req.params.from)) {
    const result = { error: "unsupported currency " + req.params.from };
    res.status(404);
    res.send(result);
    return;
  }
  try {
    const ticker = await getCurrentPrice(db, req.params.from, logger);

    const result: any = { error: null, ticker };
    if (config.has("coinPrice.pubKeyDataSignature")) {
      // We switched pubKeyData. Return the new key and its signature.
      result.pubKeyData = config.get("coinPrice.pubKeyData");
      result.pubKeyDataSignature = config.get("coinPrice.pubKeyDataSignature");
    }
    res.setHeader(
      "cache-control",
      `max-age=${config.get("coinPrice.currentPriceHttpCacheControlMaxAge")}`
    );
    res.send(result);
  } catch (error: any) {
    const result = { error: error.message };
    res.status(500);
    res.send(result);
  }
}

async function historicalPrice(
  db: Pool,
  logger: Logger,
  req: Request,
  res: Response
): Promise<void> {
  if (!constants.fromCurrencies.includes(req.params.from)) {
    const result = { error: "unsupported currency " + req.params.from };
    res.status(404);
    res.send(result);
    return;
  }

  if (!req.params.timestamps.match(/^\d+(,\d+)*$/)) {
    const result = { error: "invalid timestamps format" };
    res.status(400);
    res.send(result);
    return;
  }

  const timestamps = req.params.timestamps.split(",").map(Number);

  for (const time of timestamps) {
    if (
      time < constants.historicalPriceStartTimestampMs ||
      time > Date.now() + constants.historicalPriceTimeSkewAllowance
    ) {
      const result = { error: `timestamp ${time} out of range` };
      res.status(404);
      res.send(result);
      return;
    }
  }

  try {
    const tickers = await getHistoricalPrice(
      db,
      req.params.from,
      timestamps,
      logger
    );
    const result = { error: null, tickers };
    res.send(result);
  } catch (error: any) {
    const result = { error: error.message };
    res.status(500);
    res.send(result);
    logger.error(error);
  }
}

const logger = Logger.createLogger({
  name: "coin-price-handler",
  level: config.get("coinPrice.logLevel"),
});

export default function installHandlers(server: any, db: Pool): void {
  server.get("/price/:from/current", currentPrice.bind(null, db, logger));
  server.get(
    "/price/:from/:timestamps",
    historicalPrice.bind(null, db, logger)
  );
}
