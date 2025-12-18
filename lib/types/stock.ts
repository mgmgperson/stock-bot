export type SMAWindow = 20 | 50 | 120 | 200;

export type BelowSmaItem = {
  symbol: string;
  close: number;     // last close
  sma: number;       // SMA(window) as of last close
  pctBelow: number;  // (close - sma) / sma  (negative means below)
};

export type ScanResponse = {
  window: SMAWindow;
  asOf: string;      // YYYY-MM-DD (market date for the close)
  count: number;
  below: BelowSmaItem[];
};
