/** One daily price bar. `date` is the trading day in YYYY-MM-DD (US Eastern). */
export interface Candle {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type Direction = "UP" | "DOWN" | "SIDEWAYS" | "UNAVAILABLE";

export type ConfidenceLevel = "HIGH" | "MEDIUM" | "LOW";

/** +1 bullish, -1 bearish, 0 neutral. */
export type Signal = -1 | 0 | 1;
