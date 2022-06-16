// @flow
const config = require('config');
const fetch =  require('fetch-timeout');
const { PublicKey } = require('cardano-wallet');
const logger = require('./logger');
const sign = require('./sign');

import type { Ticker } from './types';

async function monitor(tickerFromApi: Ticker): Promise<void> {
  let tickerFromService: ?Ticker;

  for (let retry = 0; retry < 3; retry++) {
    try {
      logger.info('fetch price data from the service', { retry });
      const response = await fetch(
        `${config.serviceEndPointUrlPrefix}/price/ADA/current`,
        {},
        config.fetchTimeout,
        'fetch timeout'
      );
      if (!response.ok) {
        throw new Error(`error response ${response.status}`);
      }
      tickerFromService = (await response.json()).ticker;
      logger.info('price data from the service', tickerFromService);
      break;
    } catch (error) {
      logger.error(error);
    }    
  }

  if (!tickerFromService) {
    throw new Error('service is unavailable');
  }

  // Check signature.
  if (!sign.verify(tickerFromService, sign.serializeTicker, tickerFromService.signature,
    PublicKey.from_hex(config.pubKeyData))) {
    throw new Error('ticker signature error');
  }

  // Check refreshness.
  if (Date.now() - tickerFromService.timestamp > config.serviceDataFreshnessThreshold) {
    throw new Error('data are stale');
  }

  // Check price values against data directly fetched from API
  for (const currency of [...config.targetFiatCurrencies, ...config.targetCryptoCurrencies]) {
    const priceFromService = tickerFromService.prices[currency];
    const priceFromApi = tickerFromApi.prices[currency];
    if (Math.abs(priceFromService - priceFromApi) > config.monitorDiscrepancyThreshold * priceFromApi) {
      throw new Error(`prices of ${currency} differs too much`);
    }
  }
}

module.exports = { monitor };
