// @flow
const config = require('config');
const api = require('./api');
const exchangeRate = require('./fiat-exchange-rate');
const fetcher = require('./fetcher');

import type { PairRate } from './types';

const ALLOWED_DEVIATION_FROM_MEDIAN = 0.2; //20%

beforeAll(async () => {
  await exchangeRate.start();
});

afterAll(() => {
  exchangeRate.stop();
});

// We need this because flow doesn't recognize the timeout parameter:
declare function test(name: string, fn: void => Promise<void>, timeout?: number): void;

jest.setTimeout(60*1000);

test('consistency of data fetched from different APIs', async () => {
  const providers = Object.keys(api.providers);
  const rawMultiSourceData: Array<?Array<PairRate>> = await Promise.all(
    providers.map(apiName => fetcher.queryAndNormalize(apiName)));
  const multiSourceData: Array<Array<PairRate>> = (rawMultiSourceData.filter(d => d !== null): any);
  for (const to of [...config.targetFiatCurrencies, ...config.targetCryptoCurrencies]) {
    const prices = multiSourceData.map(data => {
      const pair = data.find(pair => pair.to === to);
      if (!pair) {
        throw new Error('missing data');
      }
      return pair.price;
    });

    prices.sort((a, b) => a - b);

    const median = prices[Math.floor(prices.length / 2)];

    for (const price of prices) {
      if (Math.abs(price - median) > ALLOWED_DEVIATION_FROM_MEDIAN * median) {
        throw new Error(`Prices of ${to} is inconsistent: ${price} outlies from [${prices.join(',')}].\n`+
          `Data from ${providers.join(' ')}:\n${JSON.stringify(multiSourceData)}`);
      }
    }
  }
});
