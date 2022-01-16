export type Ticker = {
  from: string;
  timestamp: number;
  signature?: string;
  prices: { [targetCurrency: string]: number };
};
