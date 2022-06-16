export default {
  priceUpdateInterval: 15 * 60 * 1000,
  fromCurrencies: ["ADA", "ERG"],
  targetCurrencies: ["USD", "JPY", "EUR", "CNY", "KRW", "ETH", "BTC", "BRL"],
  historicalPriceStartTimestampMs: new Date(2017, 9, 2).valueOf(),
  historicalPriceTimeSkewAllowance: 10 * 1000,
};
