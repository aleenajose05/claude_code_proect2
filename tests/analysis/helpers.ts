import type { Candle } from "@/lib/analysis/types";

/** Builds one synthetic bar per weekday starting at `start`, using the given closes (test data only). */
export function weekdayCandles(start: string, closes: readonly number[]): Candle[] {
  const candles: Candle[] = [];
  let day = Date.parse(`${start}T00:00:00Z`);
  for (const close of closes) {
    while ([0, 6].includes(new Date(day).getUTCDay())) day += 86_400_000;
    candles.push({
      date: new Date(day).toISOString().slice(0, 10),
      open: close,
      high: close * 1.01,
      low: close * 0.99,
      close,
      volume: 1_000_000,
    });
    day += 86_400_000;
  }
  return candles;
}
