// @flow
// This module provides fiat exchange rates.
const fs = require('fs');
const config = require('config');
const fetch = require('fetch-timeout');
const logger = require('./logger');

type Rates = { [to: string]: number };
type Response = { timestamp: number, rates: Rates };
type Cache = {| response: Response, timestamp: number, version: number |};

let rates: ?Rates;
let timeoutId: TimeoutID;

function stop() {
  clearTimeout(timeoutId);
}

async function start(): Promise<void> {
  for (let retry = 0; ; retry++) {
    const _logger = logger.child({ exchangeRateRequest: retry });

    try {
      _logger.info('requesting exchange rates');

      // Try to load from cache to avoid exceeding limits of the API. The API
      // data is hourly anyway.
      try {
        const cache: Cache = require(config.exchangeRateCachePath);
        _logger.info('cached exchange rate', cache);
        /*
          Sometimes openexchangerates keeps returning a stale timestamp for a while.
          When this happens, we don't want to re-query every time to avoid
          exhausting the query quota.
        */
        if (Date.now() - cache.response.timestamp * 1000 < config.exchangeRateCacheTime ||
          Date.now() - cache.timestamp < config.exchangeRateRefreshInterval
        ) {
          _logger.info('use cached exchange rates');
          rates = cache.response.rates;
          break;
        }
        _logger.info('cached exchange rates are stale');
      } catch (_) {
        _logger.info('no exchange rate cache');
      }


      const response = await fetch(
        `https://openexchangerates.org/api/latest.json?app_id=${config.apiKeys.openexchangerates}&base=USD&symbols=EUR,CNY,JPY,KRW`,
        {},
        config.fetchTimeout,
        'fetch timeout'
      );
      if (!response.ok) {
        throw new Error(`error response: ${response.status} ${response.statusText}`);
      }
      const json = await response.json();
      _logger.info('response', json);
      if (!validateRates(json.rates)) {
        throw new Error('invalid response');
      }
      rates = json.rates;
      let cache: Cache = { response: json, timestamp: Date.now(), version: 1 };
      try {
        fs.writeFileSync(config.exchangeRateCachePath, JSON.stringify(cache));
      } catch (error) {
        _logger.error('failed to write cache', error);
      } 
      break;
    } catch (error) {
      _logger.error(error);
      if (retry === 2) {
        throw new Error('failed to query exchange rate');
      }
      await new Promise(resolve => { setTimeout(resolve, 10*1000); });
    }
  }
  timeoutId = setTimeout(start, config.exchangeRateRefreshInterval);
}

function getFromUsd(to: string): number {
  if (!rates) {
    throw new Error('fiat exchange rates are unavailable');
  }
  return rates[to];
}

function validateRates(rates/*: Object*/) {
  for (const currency of config.targetFiatCurrencies.filter(c => c !== 'USD')) {
    if (typeof rates[currency] !== 'number') {
      return false;
    }
  }
  return true;
}

module.exports = { start, stop, getFromUsd };

//NODE_ENV=develop node src/fiat-exchange-rate.js  | ./node_modules/.bin/bunyan
if (require.main === module) {
  (async () => {
    await start();
    console.log('started');
  })().catch(error => {
    console.error(error);
  });
}
