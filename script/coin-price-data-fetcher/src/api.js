// @flow
// This module defines the API providers.
import type { PairRate } from './types';

class ErrorResponse extends Error {
  constructor(msg?: string) {
    super(msg || 'Unexpected resposne');
  }
}

export type FetchFunc = (url: string, headers?: { [header:string]: string }) =>
  Promise<Object>;
export type ApiFunc = (fetch: FetchFunc, apiKey: string) => Promise<Array<PairRate>>;

// Provides ADA-all
const cryptocompare: ApiFunc = async (fetch, apiKey) => {
  const response = await fetch(`https://min-api.cryptocompare.com/data/price?fsym=ADA&tsyms=USD,JPY,EUR,CNY,KRW,BTC,ETH&api_key=${apiKey}`);
  if (response.Response === 'Error') {
    throw new ErrorResponse();
  }
  return ['USD', 'JPY', 'EUR', 'CNY', 'KRW', 'BTC', 'ETH'].map(to =>
    ({ from: 'ADA', to, price: response[to] }));
};

// Provides ADA-USD, BTC-USD, ETH-USD
const coinlayer: ApiFunc = async (fetch, apiKey) => {
  const response = await fetch(`http://api.coinlayer.com/api/live?access_key=${apiKey}&symbols=ADA,BTC,ETH&target=USD`);
  if (response.success !== true) {
    throw new ErrorResponse();
  }
  return Object.keys(response.rates).map(from => ({ from, to: 'USD', price: response.rates[from] }));
};

// Provides ADA-USD, BTC-USD, ETH-USD
const coinmarketcap: ApiFunc = async (fetch, apiKey) => {
  const response = await fetch(`https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?symbol=ADA,ETH,BTC&convert=USD`, {
    'X-CMC_PRO_API_KEY': apiKey,
    'Accept': 'application/json'
  });
  if (response.status.error_code !== 0) {
    throw new ErrorResponse();
  }
  return ['ETH', 'ADA', 'BTC'].map(from =>
    ({ from, to: 'USD', price: response.data[from].quote.USD.price }));
};

// Provides ADA-USD, ADA-BTC, ADA-ETH
const coinapi: ApiFunc = async (fetch, apiKey) => {
  return Promise.all(['USD', 'BTC', 'ETH'].map(async (to) => {
    const response = await fetch(`https://rest.coinapi.io/v1/exchangerate/ADA/${to}`,
      { 'X-CoinAPI-Key': apiKey });
    return { from: 'ADA', to, price: response.rate };
  }));
};

// Provides ADA-all
const coinpaprika: ApiFunc = async (fetch, _apiKey) => {
  const response = await fetch('https://api.coinpaprika.com/v1/tickers/ada-cardano?quotes=USD,BTC,ETH,JPY,EUR,CNY,KRW');
  return ['USD', 'JPY', 'EUR', 'CNY', 'KRW', 'BTC', 'ETH'].map(to =>
    ({ from: 'ADA', to, price: response.quotes[to].price }));
};

// Provides ADA-USD,BTC,ETH
const nomics: ApiFunc = async (fetch, apiKey) => {
  let result;
  // fetch ETH,BTC to ADA rate and take the reciprocals
  let response = await fetch(`https://api.nomics.com/v1/currencies/ticker?key=${apiKey}&ids=ETH,BTC&convert=ADA&interval=1h`);
  result = response.map(data => 
    ({ from: 'ADA', to: data.symbol, price: 1/Number(data.price) })
  );

  // fetch ADA-USD
  response = await fetch(`https://api.nomics.com/v1/currencies/ticker?key=${apiKey}&ids=ADA&convert=USD&interval=1h`);
  result.push({ from: 'ADA', to: 'USD', price: Number(response[0].price) });
  
  return result;
};

// Provides ADA-all except CNY
const cryptonator: ApiFunc = async (fetch, apiKey) => {
  // cryptonator doesn't have CNY or KRW
  return Promise.all(['usd', 'jpy', 'eur', 'btc', 'eth'].map(async (to) => {
    const response = await fetch(`https://api.cryptonator.com/api/ticker/ada-${to}`);
    if (response.success !== true) {
      throw new ErrorResponse();
    }
    return { from: 'ADA', to: response.ticker.target, price: Number(response.ticker.price) };
  }));
};

// Provides ADA-USD,BTC,ETH
const shrimpy: ApiFunc = async (fetch, _apiKey) => {
  const response = await fetch('https://dev-api.shrimpy.io/v1/exchanges/kraken/ticker');
  const adaData = response.find(data => data.symbol === 'ADA');
  const ethData = response.find(data => data.symbol === 'ETH');

  return [
    { from: 'ADA', to: 'USD', price: Number(adaData.priceUsd) },
    { from: 'ADA', to: 'BTC', price: Number(adaData.priceBtc) },
    { from: 'ADA', to: 'ETH', price: Number(adaData.priceUsd) / Number(ethData.priceUsd) }
  ];      
};

// Provides ADA-BTC,ETH,USD,EUR
const cryptoapis: ApiFunc = async (fetch, apiKey) => {
  /* source:
     curl -H 'X-API-Key:b67bf0950e65a556579e2d27e1c3914d44158628' 'https://api.cryptoapis.io/v1/assets/meta?skip=skip&limit=limit' | python -mjson.tool */
  const ids = {
    ADA: '5b1ea92e584bf5002013062d',
    BTC: '5b1ea92e584bf50020130612',
    USD: '5b1ea92e584bf50020130615',
    EUR: '5b1ea92e584bf5002013061a',
    ETH: '5b755dacd5dd99000b3d92b2',
  }
  return Promise.all(['BTC', 'ETH', 'USD'].map(async (to) => {
    const response = await fetch(`https://api.cryptoapis.io/v1/exchange-rates/${ids.ADA}/${ids[to]}`, 
      { 'X-API-Key': apiKey });
    return { from: 'ADA', to, price: response.payload.weightedAveragePrice }
  }));
};

// A mock API that always fails, for testing
const badMockApi: ApiFunc = async (_fetch, _apiKey) => {
  throw new Error('bad mock API fails');
};

module.exports = {
  ErrorResponse,
  providers: {
    cryptocompare,
    coinlayer,
    coinmarketcap,
    coinapi,
    coinpaprika,
    nomics,
    cryptonator,
    shrimpy,
    cryptoapis,
    badMockApi,
  },
};

