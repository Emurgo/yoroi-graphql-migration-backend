// @flow
const config = require('config');
const { PrivateKey } = require('@emurgo/cardano-serialization-lib-nodejs');
const exchangeRate = require('./fiat-exchange-rate');
const fetcher = require('./fetcher');
const logger = require('./logger');
const sign = require('./sign');
const uploader = require('./uploader');
const monitor = require('./monitor');
const utils = require('./utils');

import type { Ticker } from './types';

function median(numbers: Array<number>): number {
  numbers.sort((a, b) => a - b);
  return numbers[Math.floor(numbers.length/2)];
}

async function main() {
  let mode = (process.argv[2] === 'monitor') ? 'monitor' : 'fetcher';

  logger.info(`start ${mode}`);

  await exchangeRate.start();

  const providers = (mode === 'monitor') ? config.monitorProviders : config.fetcherProviders;
  const multiSourceData = (
    await utils.PromiseAll(
      providers.map(apiName => () => fetcher.queryAndNormalize(apiName))
    )
  ).filter(data => data !== null);
  logger.info('fetched data', multiSourceData);

  const ticker: Ticker = {
    from: 'ADA',
    timestamp: Math.floor(Date.now()/1000) * 1000,
    prices: {}
  };

  // take the median over data from mulitiple APIs
  for (const to of [...config.targetFiatCurrencies, ...config.targetCryptoCurrencies]) {
    const price = median(multiSourceData.map(data => 
      data.find(pair => pair.to === to).price
    ));
    ticker.prices[to] = price;
  }
  ticker.signature = sign.sign(
    ticker, sign.serializeTicker,
    PrivateKey.from_extended_bytes(Buffer.from(config.privKeyData, 'hex'))
  );
  logger.info('uploading ticker', ticker);

  if (mode === 'monitor') {
    await monitor.monitor(ticker);
  } else {
    await uploader.upload( ticker );
  }
  process.exit(0);
}

main().catch(error => {
  logger.error(error);
  process.exit(1);
});

