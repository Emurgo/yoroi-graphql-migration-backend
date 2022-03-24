module.exports  = {
  sourceCurrencies: ['ADA', 'ERG'],
  targetFiatCurrencies: ['USD', 'JPY', 'EUR', 'CNY', 'KRW', 'BRL'],
  targetCryptoCurrencies: ['ETH', 'BTC'],
  logger: {
    level: 'info'
  },
  exchangeRateRefreshInterval: 10*60*1000,
  serviceDataFreshnessThreshold: 2*60*1000,
  // monitor allows 10% difference between the price from the service and directly from the API
  monitorDiscrepancyThreshold: 0.1,
  fetchTimeout: 30*1000,
  apiKeys: {
    cryptocompare: process.env.API_KEY_CRYPTOCOMPARE,
    coinlayer: process.env.API_KEY_COINLAYER,
    coinmarketcap: process.env.API_KEY_COINMARKETCAP,
    coinapi: process.env.API_KEY_COINAPI,
    nomics: process.env.API_KEY_NOMICS,
    cryptoapis: process.env.API_KEY_CRYPTOAPIS,
    openexchangerates: process.env.API_KEY_OPENEXCHANGERATES,
  },

  privKeyData: process.env.COIN_PRICE_PRIV_KEY,
  pubKeyData: process.env.COIN_PRICE_PUB_KEY,

  s3: {
    region: process.env.PRICE_DATA_S3_REGION,
    bucketName: process.env.PRICE_DATA_S3_BUCKET_NAME,
    accessKeyId: process.env.PRICE_DATA_S3_ACCESS_KEY_ID,
    secretAccessKey: process.env.PRICE_DATA_S3_SECRET_ACCESS_KEY,
  },

  exchangeRateCachePath: '/tmp/exchange-rates.json',
  exchangeRateCacheTime: 60*60*1000, // 1 hour

  fetcherProviders: JSON.parse(process.env.PRICE_PROVIDERS || 'null'),
  noParallel: true,
}
