// @flow
export type Ticker = {|
  from: string,
  timestamp: number,
  signature?: string,
  prices: { [targetCurrency:string]: number }
|};

export type PairRate = {|
  from: string,
  to: string,
  price: number,
|};
