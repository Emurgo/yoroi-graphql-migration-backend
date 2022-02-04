// @flow
// This module defines the API providers.
const utils = require('./utils');
import type { PairRate } from './types';

class ErrorResponse extends Error {
  constructor(msg?: string) {
    super(msg || 'Unexpected resposne');
  }
}

export type FetchFunc = (url: string, headers?: { [header:string]: string }) =>
  Promise<Object>;
export type ApiFunc = (fetch: FetchFunc, apiKey: string) => Promise<Array<PairRate>>;

// Provides source-all
const cryptocompare: ApiFunc = async (fetch, apiKey) => {
  const response = await fetch(`https://min-api.cryptocompare.com/data/price?fsym=BTC&tsyms=USD,JPY,EUR,CNY,KRW,BRL,ETH,ADA,ERG&api_key=${apiKey}`);
  if (response.Response === 'Error') {
    throw new ErrorResponse();
  }
  return ['ERG', 'ADA'].flatMap(from =>
    ['USD', 'JPY', 'EUR', 'CNY', 'KRW', 'BTC', 'ETH', 'BRL'].map(to =>
      ({
        from,
        to,
        price: (to === 'BTC' ? 1 : response[to])/response[from]
      })
    )
  );
};

// Provides ADA-USD, BTC-USD, ETH-USD, no ERG so not useful
const coinlayer: ApiFunc = async (fetch, apiKey) => {
  const response = await fetch(`http://api.coinlayer.com/api/live?access_key=${apiKey}&symbols=ADA,BTC,ETH&target=USD`);
  if (response.success !== true) {
    throw new ErrorResponse();
  }
  return Object.keys(response.rates).map(from => ({ from, to: 'USD', price: response.rates[from] }));
};

// Provides ADA-USD, BTC-USD, ETH-USD, ERG-USD
const coinmarketcap: ApiFunc = async (fetch, apiKey) => {
  const response = await fetch(`https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?symbol=ADA,ETH,BTC,ERG&convert=USD`, {
    'X-CMC_PRO_API_KEY': apiKey,
    'Accept': 'application/json'
  });
  if (response.status.error_code !== 0) {
    throw new ErrorResponse();
  }
  return ['ETH', 'ADA', 'BTC', 'ERG'].map(from =>
    ({ from, to: 'USD', price: response.data[from].quote.USD.price }));
};

// Provides ADA,ERG-USD, ADA,ERG-BTC, ADA,ERG-ETH
const coinapi: ApiFunc = async (fetch, apiKey) => {
  const adaPrices = await utils.PromiseAll(['USD', 'BTC', 'ETH', 'ERG'].map(to => async () => {
    const response = await fetch(`https://rest.coinapi.io/v1/exchangerate/ADA/${to}`,
      { 'X-CoinAPI-Key': apiKey });
    return { from: 'ADA', to, price: response.rate };
  }));
  const calcErgPrice = to => (
    {
      from: 'ERG',
      to,
      price: adaPrices.find(p => p.to === to).price / adaPrices.find(p => p.to === 'ERG').price
    }
  );
  return [
    ...adaPrices,
    calcErgPrice('USD'),
    calcErgPrice('BTC'),
    calcErgPrice('ETH'),
  ];
};

// Provides ADA-all
const coinpaprika: ApiFunc = async (fetch, _apiKey) => {
  const responseAda = await fetch(
    'https://api.coinpaprika.com/v1/tickers/ada-cardano?quotes=USD,BTC,ETH,JPY,EUR,CNY,KRW,BRL'
  );
  const resultAda = ['USD', 'JPY', 'EUR', 'CNY', 'KRW', 'BTC', 'ETH', 'BRL'].map(to =>
    ({ from: 'ADA', to, price: responseAda.quotes[to].price })
  );
  const responseErg = await fetch(
    'https://api.coinpaprika.com/v1/tickers/efyt-ergo?quotes=USD,BTC,ETH,JPY,EUR,CNY,KRW,BRL'
  );
  const resultErg = ['USD', 'JPY', 'EUR', 'CNY', 'KRW', 'BTC', 'ETH', 'BRL'].map(to =>
    ({ from: 'ERG', to, price: responseErg.quotes[to].price })
  );
  return [...resultAda, ...resultErg];
};

// Provides ADA,ERG-USD,BTC,ETH
const nomics: ApiFunc = async (fetch, apiKey) => {
  let response = await fetch(`https://api.nomics.com/v1/currencies/ticker?key=${apiKey}&ids=ETH,BTC,ERG,ADA&convert=USD&interval=1h`);
  const result = response.map(data => 
    ({ from: data.symbol, to: 'USD', price: Number(data.price) })
  );
  const getPrice = (from, to) => result.find(p => p.from === from && p.to === to).price;
  return [
    { from: 'ADA', to: 'USD', price: getPrice('ADA', 'USD') },
    { from: 'ADA', to: 'ETH', price: getPrice('ADA', 'USD') / getPrice('ETH', 'USD') },
    { from: 'ADA', to: 'BTC', price: getPrice('ADA', 'USD') / getPrice('BTC', 'USD') },
    { from: 'ERG', to: 'USD', price: getPrice('ERG', 'USD') },
    { from: 'ERG', to: 'ETH', price: getPrice('ERG', 'USD') / getPrice('ETH', 'USD') },
    { from: 'ERG', to: 'BTC', price: getPrice('ERG', 'USD') / getPrice('BTC', 'USD') },
  ];
};

// Provides ADA,ERG-USD,BTC,ETH
// Might get 503 error  
const cryptonator: ApiFunc = async (fetch, apiKey) => {
  const result = await utils.PromiseAll(['ada', 'erg', 'btc', 'eth'].map(from => async () => {
    const response = await fetch(`https://api.cryptonator.com/api/full/${from}-usd`);
    if (response.success !== true) {
      throw new ErrorResponse();
    }
    return {
      from: from.toUpperCase(),
      to: response.ticker.target,
      price: Number(response.ticker.price)
    };
  }));
  const getPrice = (from, to) => result.find(p => p.from === from && p.to === to).price;
  return [
    { from: 'ADA', to: 'USD', price: getPrice('ADA', 'USD') },
    { from: 'ADA', to: 'ETH', price: getPrice('ADA', 'USD') / getPrice('ETH', 'USD') },
    { from: 'ADA', to: 'BTC', price: getPrice('ADA', 'USD') / getPrice('BTC', 'USD') },
    { from: 'ERG', to: 'USD', price: getPrice('ERG', 'USD') },
    { from: 'ERG', to: 'ETH', price: getPrice('ERG', 'USD') / getPrice('ETH', 'USD') },
    { from: 'ERG', to: 'BTC', price: getPrice('ERG', 'USD') / getPrice('BTC', 'USD') },
  ];
};

// Provides ADA-USD,BTC,ETH
// no ERG
const shrimpy: ApiFunc = async (fetch, _apiKey) => {
  const response = await fetch('https://dev-api.shrimpy.io/v1/exchanges/kraken/ticker');
  const adaData = response.find(data => data.symbol === 'ADA');
  const ethData = response.find(data => data.symbol === 'ETH');
  //const ergData = response.find(data => data.symbol === 'ERG');
  
  return [
    { from: 'ADA', to: 'USD', price: Number(adaData.priceUsd) },
    { from: 'ADA', to: 'BTC', price: Number(adaData.priceBtc) },
    { from: 'ADA', to: 'ETH', price: Number(adaData.priceUsd) / Number(ethData.priceUsd) },
    //{ from: 'ERG', to: 'USD', price: Number(ergData.priceUsd) },
    //{ from: 'ERG', to: 'BTC', price: Number(ergData.priceBtc) },
  ];      
};

// Provides ADA-BTC,ETH,USD,EUR
// NOT MAINTAINED because no free plan
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
  return utils.PromiseAll(['BTC', 'ETH', 'USD'].map(to => async () => {
    const response = await fetch(`https://api.cryptoapis.io/v1/exchange-rates/${ids.ADA}/${ids[to]}`, 
      { 'X-API-Key': apiKey });
    return { from: 'ADA', to, price: response.payload.weightedAveragePrice }
  }));
};

// Provides ADA,ERG-all
const coinbase: ApiFunc = async (fetch, _apiKey) => {
  const adaResponse = await fetch('https://api.coinbase.com/v2/exchange-rates?currency=ADA');
  if (!adaResponse.data || !adaResponse.data.rates) {
    throw new ErrorResponse();
  }
  const ergResponse = await fetch('https://api.coinbase.com/v2/exchange-rates?currency=ERG');
  if (!ergResponse.data || !ergResponse.data.rates) {
    throw new ErrorResponse();
  }

  return ['BTC', 'ETH', 'USD', 'EUR', 'CNY', 'KRW', 'JPY'].flatMap(to => [
    { from: 'ADA', to, price: Number(adaResponse.data.rates[to]) },
    { from: 'ERG', to, price: Number(ergResponse.data.rates[to]) }
  ]);
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
    coinbase,
    badMockApi,
  },
};

