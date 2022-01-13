// @flow
// This modules fetches data using APIs defined in api.js.
const config = require('config');
const fetch = require('fetch-timeout');
const api = require('./api');
const logger = require('./logger');
const exchangeRate = require('./fiat-exchange-rate');

import type { PairRate } from './types';

async function queryApi(apiName: string): Promise<Array<PairRate>> {
  let retry = 0;

  async function _fetch(url, headers) {
    let __logger = logger.child({ apiName, url, retry });
    __logger.info('fetching ' + url, headers);
    const response = await fetch(url, { headers }, config.fetchTimeout, 'fetch timeout');
    if (!response.ok) {
      __logger.error('error', response.status, response.statusText); 
      throw new Error('Fetch error');
    }
    const json = await response.json();
    __logger.info('response', json);
    return json;
  }

  for (;;) {
    const _logger = logger.child({ api: apiName, retry });

    try {
      const result = await api.providers[apiName](_fetch, config.apiKeys[apiName]);
      _logger.info(`got data from ${apiName}`, { result });
      return result;
    } catch (error) {
      _logger.error(error);
      if (retry === 2) {
        throw new Error(`failed to get data from ${apiName}`)
      }
      retry++;
    }
  } //for
  throw new Error('will never reach here');
}

/* 
  Each API provider has different capabilities. Some lacks exchange rates 
  against certain fiat currencies. This function calculates missing exchanges so
  that the returned ticker set include pairs of ADA and all target currencies. 
*/
function normalizeQueryResult(queryResult: Array<PairRate>): Array<PairRate> {
  function findPair(from, to) {
    return queryResult.find(pair => (pair.from === from) && (pair.to === to));
  }
  const result = [];
  const adaUsd = findPair('ADA', 'USD');
  if (!adaUsd) {
    throw new Error('missing ADA-USD rate');
  }
  result.push(adaUsd);

  for (const fiat of config.targetFiatCurrencies.filter(s => s !== 'USD')) {
    const pair = findPair('ADA', fiat);
    if (pair) {
      result.push(pair);
    } else {
      const price = adaUsd.price * exchangeRate.getFromUsd(fiat);
      result.push({ from: 'ADA', to: fiat, price });
    }
  }

  for (const crypto of config.targetCryptoCurrencies) {
    const pair = findPair('ADA', crypto);
    if (pair) {
      result.push(pair);
      continue;
    } 

    const cryptoUsd = findPair(crypto, 'USD');
    if (!cryptoUsd) {
      throw new Error(`missing ${crypto} rate`);
    }
    const price = adaUsd.price/cryptoUsd.price;
    result.push({ from: 'ADA', to: crypto, price });
  }

  return result;
}

async function queryAndNormalize(apiName: string): Promise<?Array<PairRate>> {
  let apiResult;
  try {
    apiResult = await queryApi(apiName);
  } catch (_) {
    return null;
  }
  return normalizeQueryResult(apiResult);
}

module.exports = { queryAndNormalize };

//NODE_ENV=development node fetcher.js | ./node_modules/.bin/bunyan -c 'this.msg.match(/got data from/)'
if (require.main === module) {
  (async () => {
    await exchangeRate.start();
    for (const apiName in api.providers) {
      console.log('-'.repeat(30)+apiName+'-'.repeat(30));
      const result = await queryApi(apiName);
      logger.info('normalized result', normalizeQueryResult(result));
    }
    process.exit(0);
  })().catch(error => {
    console.error(error);
  });
}

