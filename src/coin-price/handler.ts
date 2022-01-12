import Logger from "bunyan";
import config from "config";
import CardanoWasm from "@emurgo/cardano-serialization-lib-nodejs"
import { verify, serializeTicker } from "./sign";
import constants from "./constants";
import { getCurrentPrice, getHistoricalPrice, insertPriceData } from "./model";

import type { Request, Response } from 'express';
import type { Pool } from 'pg';
import type { Ticker } from './types';

type LogFunc = (resultOrError: any, statusCode: any, req: Request) => void;

async function currentPrice(
  db: Pool,
  logger: Logger,
  log: LogFunc,
  req: Request,
  res: Response,
): Promise<void> {
  if (!constants.fromCurrencies.includes(req.params.from)) {
    const result = { error: 'no price data for '+req.params.from };
    log(result, 404, req);
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
    log(result, 200, req);
    res.setHeader('cache-control',
      `max-age=${config.get("coinPrice.currentPriceHttpCacheControlMaxAge")}`);
    res.send(result);
  } catch (error) {
    const result = { error: error.message };
    log(result, 500, req);
    res.status(500);
    res.send(result);
  }
}

async function historicalPrice(
  db: Pool,
  logger: Logger,
  log: LogFunc,
  req: Request,
  res: Response,
): Promise<void> {
  if (!constants.fromCurrencies.includes(req.params.from)) {
    const result = { error: 'no price data for '+req.params.from };
    log(result, 404, req);
    res.status(404);
    res.send(result);
    return;
  } 

  if (!req.params.timestamps.match(/^\d+(,\d+)*$/)) {
    const result = { error: 'invalid timestamps format' };
    log(result, 400, req);
    res.status(400);
    res.send(result);
    return;
  }

  const timestamps =  req.params.timestamps.split(',').map(Number);

  for (const time of timestamps) {
    if (time < constants.historicalPriceStartTimestampMs ||
      time > Date.now()+constants.historicalPriceTimeSkewAllowance) {
      const result = { error: `timestamp ${time} out of range` };
      log(result, 404,req);
      res.status(404);
      res.send(result);
      return;
    }
  }

  try {
    const tickers = await getHistoricalPrice(db, req.params.from, timestamps, logger);
    const result = { error: null, tickers };
    log(result, 200, req);
    res.send(result);
  } catch (error) {
    const result = { error: error.message };
    log(result, 500, req);
    res.status(500);
    res.send(result);
    logger.error(error);
  }
}

async function uploadPrice(
  db: Pool,
  logger: Logger,
  log: LogFunc,
  req: Request,
  res: Response,
): Promise<void> {

  if (!validateTicker(req.body.ticker)) {
    const result = { error: 'invalid price data' };
    log(result, 400, req);
    res.status(400);
    res.send(result);
    return;
  }

  try {
    await insertPriceData(db, req.body.ticker);
    const result = { error: null };
    log(result, 200, req);
    res.send(result);
  } catch (error) {
    const result = { error: error.message };
    log(result, 500, req);
    res.status(500);
    res.send(result);
  }
}

const publicKey = CardanoWasm.PublicKey.from_bytes(
  Buffer.from(config.get("coinPrice.pubKeyData") as string, "hex")
);

function validateTicker(ticker: Ticker): boolean {
  if (!ticker.signature) {
    return false;
  }
  return verify(ticker, serializeTicker, ticker.signature, publicKey);
}

const logger = Logger.createLogger({
  name: "coin-price-handler",
  level: config.get("coinPrice.logLevel"),
});

export default function installHandlers(server: any, db: Pool, logRequest: LogFunc): void {
  server.get('/price/:from/current', 
    currentPrice.bind(null, db, logger, logRequest));
  server.get('/price/:from/:timestamps', 
    historicalPrice.bind(null, db, logger, logRequest));

  server.post('/price',
    uploadPrice.bind(null, db, logger, logRequest));
}

