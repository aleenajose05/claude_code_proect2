import type { Candle, Direction, Signal } from "./types";

/**
 * Deterministic indicator calculations. Formulas and thresholds are the ones
 * approved in docs/phase-1-proposal.md §8 — do not change them without approval.
 */

export const MIN_CLOSES_SMA20 = 20;
export const MIN_CLOSES_SMA50 = 50;
export const MIN_RETURNS_VOLATILITY = 40;
export const MIN_RETURN_SPAN_DAYS = 60;
export const TRADING_DAYS_PER_YEAR = 252;
export const TARGET_HORIZON_SESSIONS = 20;
export const MAX_QUOTE_AGE_SESSIONS_FOR_TARGET = 5;
/** A single daily move this large in unadjusted data is treated as a probable split. */
export const SPLIT_JUMP_THRESHOLD = 0.25;
/** Consecutive bars more than this many weekdays apart are reported as a data gap. */
export const MAX_MISSING_WEEKDAYS = 3;

const DAY_MS = 86_400_000;

function toUtcDay(date: string): number {
  const ms = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(ms)) throw new Error(`Invalid candle date: ${date}`);
  return ms;
}

function calendarDaysBetween(from: string, to: string): number {
  return Math.round((toUtcDay(to) - toUtcDay(from)) / DAY_MS);
}

/** Weekdays strictly between two dates. Holidays count as weekdays, so this over-reports slightly. */
function missingWeekdaysBetween(from: string, to: string): number {
  let missing = 0;
  for (let day = toUtcDay(from) + DAY_MS; day < toUtcDay(to); day += DAY_MS) {
    const weekday = new Date(day).getUTCDay();
    if (weekday !== 0 && weekday !== 6) missing++;
  }
  return missing;
}

function isPositiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

/** Sorts by date, drops duplicate dates and bars with unusable prices. */
export function cleanCandles(candles: readonly Candle[]): Candle[] {
  const byDate = new Map<string, Candle>();
  for (const candle of candles) {
    if (![candle.open, candle.high, candle.low, candle.close].every(isPositiveFinite)) continue;
    byDate.set(candle.date, candle);
  }
  return [...byDate.values()].sort((a, b) => toUtcDay(a.date) - toUtcDay(b.date));
}

/** SMA(n) = sum of the latest n closes / n, or null if fewer than n closes. */
export function sma(closes: readonly number[], n: number): number | null {
  if (n <= 0 || closes.length < n) return null;
  let sum = 0;
  for (let i = closes.length - n; i < closes.length; i++) sum += closes[i];
  return sum / n;
}

/** rₜ = ln(Cₜ / Cₜ₋₁) */
export function logReturns(closes: readonly number[]): number[] {
  const returns: number[] = [];
  for (let i = 1; i < closes.length; i++) returns.push(Math.log(closes[i] / closes[i - 1]));
  return returns;
}

/** Sample standard deviation (divisor M − 1), or null for fewer than 2 values. */
export function sampleStdDev(values: readonly number[]): number | null {
  if (values.length < 2) return null;
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const sumSq = values.reduce((sum, v) => sum + (v - mean) ** 2, 0);
  return Math.sqrt(sumSq / (values.length - 1));
}

export interface Indicators {
  closesCount: number;
  returnsCount: number;
  firstDate: string | null;
  lastDate: string | null;
  lastClose: number | null;
  sma20: number | null;
  sma50: number | null;
  /** (C_N / C₁ − 1) × 100 over the window, null if the data spans < 60 calendar days. */
  return90Pct: number | null;
  /** Daily log-return volatility (fraction, not %), null if < 40 returns. */
  dailyVolatility: number | null;
  /** dailyVolatility × √252, as a fraction. For display only. */
  annualVolatility: number | null;
  high90: number | null;
  low90: number | null;
  /** Bar pairs separated by more than MAX_MISSING_WEEKDAYS weekdays. */
  gaps: { from: string; to: string; missingWeekdays: number }[];
  /** Only evaluated for unadjusted history. */
  splitSuspected: boolean;
}

export function computeIndicators(
  rawCandles: readonly Candle[],
  options: { adjusted: boolean },
): Indicators {
  const candles = cleanCandles(rawCandles);
  const closes = candles.map((c) => c.close);
  const returns = logReturns(closes);
  const first = candles[0];
  const last = candles[candles.length - 1];

  const gaps: Indicators["gaps"] = [];
  for (let i = 1; i < candles.length; i++) {
    const missing = missingWeekdaysBetween(candles[i - 1].date, candles[i].date);
    if (missing > MAX_MISSING_WEEKDAYS) {
      gaps.push({ from: candles[i - 1].date, to: candles[i].date, missingWeekdays: missing });
    }
  }

  const return90Pct =
    first && last && candles.length >= 2 && calendarDaysBetween(first.date, last.date) >= MIN_RETURN_SPAN_DAYS
      ? (last.close / first.close - 1) * 100
      : null;

  const dailyVolatility = returns.length >= MIN_RETURNS_VOLATILITY ? sampleStdDev(returns) : null;

  return {
    closesCount: closes.length,
    returnsCount: returns.length,
    firstDate: first?.date ?? null,
    lastDate: last?.date ?? null,
    lastClose: last?.close ?? null,
    sma20: sma(closes, MIN_CLOSES_SMA20),
    sma50: sma(closes, MIN_CLOSES_SMA50),
    return90Pct,
    dailyVolatility,
    annualVolatility: dailyVolatility === null ? null : dailyVolatility * Math.sqrt(TRADING_DAYS_PER_YEAR),
    high90: candles.length ? Math.max(...candles.map((c) => c.high)) : null,
    low90: candles.length ? Math.min(...candles.map((c) => c.low)) : null,
    gaps,
    splitSuspected: !options.adjusted && returns.some((r) => Math.abs(Math.exp(r) - 1) > SPLIT_JUMP_THRESHOLD),
  };
}

export interface DirectionSignals {
  /** Price vs SMA20 (±1% band). */
  s1: Signal | null;
  /** Price vs SMA50 (±2% band). */
  s2: Signal | null;
  /** SMA20 vs SMA50 alignment (±0.5% band). */
  s3: Signal | null;
  /** 90-day return (±5%). */
  s4: Signal | null;
  /** Average news sentiment (±0.15), weight 0.5. null when sentiment is insufficient. */
  s5: Signal | null;
}

export interface DirectionResult {
  direction: Direction;
  /** T = Σ weight × signal, null when direction is unavailable. */
  score: number | null;
  /** |T| needed for UP/DOWN: 2.5 normally, 1.5 when SMA50 is unavailable. */
  threshold: number | null;
  signals: DirectionSignals;
}

function band(value: number, reference: number, tolerance: number): Signal {
  if (value > reference * (1 + tolerance)) return 1;
  if (value < reference * (1 - tolerance)) return -1;
  return 0;
}

export function sentimentSignal(averageSentiment: number | null): Signal | null {
  if (averageSentiment === null) return null;
  if (averageSentiment >= 0.15) return 1;
  if (averageSentiment <= -0.15) return -1;
  return 0;
}

export function classifyDirection(input: {
  price: number | null;
  sma20: number | null;
  sma50: number | null;
  return90Pct: number | null;
  /** null when fewer than 3 articles were scored. */
  averageSentiment: number | null;
}): DirectionResult {
  const { price, sma20, sma50, return90Pct } = input;
  const validPrice = price !== null && isPositiveFinite(price) ? price : null;

  const signals: DirectionSignals = {
    s1: validPrice !== null && sma20 !== null ? band(validPrice, sma20, 0.01) : null,
    s2: validPrice !== null && sma50 !== null ? band(validPrice, sma50, 0.02) : null,
    s3: sma20 !== null && sma50 !== null ? band(sma20, sma50, 0.005) : null,
    s4: return90Pct === null ? null : return90Pct > 5 ? 1 : return90Pct < -5 ? -1 : 0,
    s5: sentimentSignal(input.averageSentiment),
  };

  if (signals.s1 === null || signals.s4 === null) {
    return { direction: "UNAVAILABLE", score: null, threshold: null, signals };
  }

  const score =
    signals.s1 + (signals.s2 ?? 0) + (signals.s3 ?? 0) + signals.s4 + 0.5 * (signals.s5 ?? 0);
  const threshold = sma50 === null ? 1.5 : 2.5;
  const direction: Direction = score >= threshold ? "UP" : score <= -threshold ? "DOWN" : "SIDEWAYS";
  return { direction, score, threshold, signals };
}

export type TargetUnavailableReason =
  | "NO_VALID_QUOTE"
  | "INSUFFICIENT_HISTORY"
  | "STALE_QUOTE"
  | "SPLIT_SUSPECTED";

export type TargetRange =
  | {
      available: true;
      low: number;
      high: number;
      horizonSessions: number;
      /** σ_d × √horizon */
      horizonVolatility: number;
      aboveHistoricalHigh: boolean;
      belowHistoricalLow: boolean;
    }
  | { available: false; reason: TargetUnavailableReason };

/**
 * Zero-drift ±1σ band: [P·e^(−σ_d√h), P·e^(+σ_d√h)], h = 20 sessions unless the user asked
 * about another period. Not clipped to the 90-day high/low.
 */
export function calculateTargetRange(input: {
  /** Trading sessions ahead; defaults to the approved 20. */
  horizonSessions?: number;
  price: number | null;
  dailyVolatility: number | null;
  returnsCount: number;
  quoteAgeSessions: number | null;
  splitSuspected: boolean;
  high90: number | null;
  low90: number | null;
}): TargetRange {
  const { price, dailyVolatility } = input;
  if (price === null || !isPositiveFinite(price)) return { available: false, reason: "NO_VALID_QUOTE" };
  if (input.quoteAgeSessions === null || input.quoteAgeSessions > MAX_QUOTE_AGE_SESSIONS_FOR_TARGET) {
    return { available: false, reason: "STALE_QUOTE" };
  }
  if (dailyVolatility === null || input.returnsCount < MIN_RETURNS_VOLATILITY) {
    return { available: false, reason: "INSUFFICIENT_HISTORY" };
  }
  if (input.splitSuspected) return { available: false, reason: "SPLIT_SUSPECTED" };

  const horizonSessions = input.horizonSessions ?? TARGET_HORIZON_SESSIONS;
  const horizonVolatility = dailyVolatility * Math.sqrt(horizonSessions);
  const low = price * Math.exp(-horizonVolatility);
  const high = price * Math.exp(horizonVolatility);
  return {
    available: true,
    low,
    high,
    horizonSessions,
    horizonVolatility,
    aboveHistoricalHigh: input.high90 !== null && high > input.high90,
    belowHistoricalLow: input.low90 !== null && low < input.low90,
  };
}
