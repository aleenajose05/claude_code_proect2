import { describe, expect, it } from "vitest";

import {
  calculateTargetRange,
  classifyDirection,
  cleanCandles,
  computeIndicators,
  logReturns,
  sampleStdDev,
  sma,
} from "@/lib/analysis/indicators";
import { weekdayCandles } from "./helpers";

describe("basic formulas", () => {
  it("computes SMA over the latest n closes", () => {
    expect(sma([1, 2, 3, 4, 5], 3)).toBe(4);
    expect(sma([1, 2], 3)).toBeNull();
  });

  it("computes log returns and a sample standard deviation", () => {
    expect(logReturns([100, 110])[0]).toBeCloseTo(Math.log(1.1), 12);
    expect(sampleStdDev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(Math.sqrt(32 / 7), 12);
    expect(sampleStdDev([1])).toBeNull();
  });

  it("drops duplicate dates and unusable bars, and sorts by date", () => {
    const [a, b] = weekdayCandles("2026-08-03", [100, 101]);
    const cleaned = cleanCandles([b, a, { ...a, close: 999 }, { ...b, date: "2026-08-05", close: Number.NaN }]);
    expect(cleaned.map((c) => [c.date, c.close])).toEqual([
      ["2026-08-03", 999],
      ["2026-08-04", 101],
    ]);
  });
});

describe("computeIndicators", () => {
  // 62 weekday sessions ≈ 90 calendar days. Closes alternate 100 / 102 (synthetic).
  const closes = Array.from({ length: 62 }, (_, i) => (i % 2 === 0 ? 100 : 102));
  const candles = weekdayCandles("2026-07-27", closes);

  it("computes the approved metrics", () => {
    const ind = computeIndicators(candles, { adjusted: true });
    expect(ind.closesCount).toBe(62);
    expect(ind.returnsCount).toBe(61);
    expect(ind.sma20).toBeCloseTo(101, 12);
    expect(ind.sma50).toBeCloseTo(101, 12);
    expect(ind.return90Pct).toBeCloseTo((102 / 100 - 1) * 100, 12);
    // Returns alternate +a, −a (61 of them): mean = a/61, so compute the expectation explicitly.
    const a = Math.log(1.02);
    const returns = Array.from({ length: 61 }, (_, i) => (i % 2 === 0 ? a : -a));
    expect(ind.dailyVolatility).toBeCloseTo(sampleStdDev(returns)!, 12);
    expect(ind.annualVolatility).toBeCloseTo(sampleStdDev(returns)! * Math.sqrt(252), 12);
    expect(ind.high90).toBeCloseTo(102 * 1.01, 12);
    expect(ind.low90).toBeCloseTo(100 * 0.99, 12);
    expect(ind.gaps).toEqual([]);
    expect(ind.splitSuspected).toBe(false);
  });

  it("returns nulls when history is too short", () => {
    const ind = computeIndicators(candles.slice(0, 30), { adjusted: true });
    expect(ind.sma20).not.toBeNull();
    expect(ind.sma50).toBeNull();
    expect(ind.dailyVolatility).toBeNull();
    expect(ind.return90Pct).toBeNull(); // 30 sessions span < 60 calendar days
    const empty = computeIndicators([], { adjusted: true });
    expect([empty.sma20, empty.high90, empty.lastClose, empty.return90Pct]).toEqual([null, null, null, null]);
  });

  it("reports gaps of more than 3 missing weekdays", () => {
    const withGap = [...candles.slice(0, 10), ...candles.slice(15)];
    const ind = computeIndicators(withGap, { adjusted: true });
    expect(ind.gaps).toHaveLength(1);
    expect(ind.gaps[0].missingWeekdays).toBe(5);
  });

  it("flags a split-like jump only in unadjusted history", () => {
    const split = weekdayCandles("2026-07-27", [...Array(40).fill(200), ...Array(22).fill(100)]);
    expect(computeIndicators(split, { adjusted: false }).splitSuspected).toBe(true);
    expect(computeIndicators(split, { adjusted: true }).splitSuspected).toBe(false);
  });
});

// Worked examples from docs/phase-1-proposal.md §8d (illustrative data, not real stocks).
describe("classifyDirection", () => {
  it("Example 1 — Stock X is UP with T = 4.5", () => {
    const r = classifyDirection({ price: 105, sma20: 102, sma50: 98, return90Pct: (104 / 95 - 1) * 100, averageSentiment: 0.22 });
    expect(r.signals).toEqual({ s1: 1, s2: 1, s3: 1, s4: 1, s5: 1 });
    expect(r.score).toBe(4.5);
    expect(r.direction).toBe("UP");
  });

  it("Example 2 — Stock Y is SIDEWAYS with T = 2", () => {
    const r = classifyDirection({ price: 100, sma20: 100.5, sma50: 97, return90Pct: (100 / 98 - 1) * 100, averageSentiment: -0.05 });
    expect(r.signals).toEqual({ s1: 0, s2: 1, s3: 1, s4: 0, s5: 0 });
    expect(r.score).toBe(2);
    expect(r.direction).toBe("SIDEWAYS");
  });

  it("Example 3 — Stock Z is DOWN with T = −3", () => {
    const r = classifyDirection({ price: 250, sma20: 260, sma50: 275, return90Pct: -2, averageSentiment: null });
    expect(r.signals).toEqual({ s1: -1, s2: -1, s3: -1, s4: 0, s5: null });
    expect(r.score).toBe(-3);
    expect(r.direction).toBe("DOWN");
  });

  it("treats band edges as neutral and needs |T| ≥ 2.5", () => {
    // P exactly 1.01 × SMA20 is not "above" the band.
    const edge = classifyDirection({ price: 101, sma20: 100, sma50: 100, return90Pct: 5, averageSentiment: 0.15 });
    expect(edge.signals.s1).toBe(0);
    expect(edge.signals.s4).toBe(0);
    expect(edge.signals.s5).toBe(1);
    // 1 + 1 − 1 + 1 + 0.5 = 2.5 exactly → UP (threshold is inclusive)
    const up = classifyDirection({ price: 110, sma20: 100, sma50: 105, return90Pct: 10, averageSentiment: 0.5 });
    expect(up.signals).toEqual({ s1: 1, s2: 1, s3: -1, s4: 1, s5: 1 });
    expect(up.score).toBe(2.5);
    expect(up.direction).toBe("UP");
    // Without the sentiment boost the same prices give T = 2 → SIDEWAYS
    const flat = classifyDirection({ price: 110, sma20: 100, sma50: 105, return90Pct: 10, averageSentiment: 0 });
    expect(flat.score).toBe(2);
    expect(flat.direction).toBe("SIDEWAYS");
  });

  it("uses a ±1.5 threshold without SMA50 and is unavailable without SMA20 or R90", () => {
    const noSma50 = classifyDirection({ price: 110, sma20: 100, sma50: null, return90Pct: 10, averageSentiment: null });
    expect(noSma50.threshold).toBe(1.5);
    expect(noSma50.score).toBe(2);
    expect(noSma50.direction).toBe("UP");
    expect(classifyDirection({ price: 110, sma20: null, sma50: null, return90Pct: 10, averageSentiment: 0.9 }).direction).toBe("UNAVAILABLE");
    expect(classifyDirection({ price: 110, sma20: 100, sma50: 100, return90Pct: null, averageSentiment: 0.9 }).direction).toBe("UNAVAILABLE");
    expect(classifyDirection({ price: null, sma20: 100, sma50: 100, return90Pct: 1, averageSentiment: 0.9 }).direction).toBe("UNAVAILABLE");
  });

  it("never lets sentiment alone decide the direction", () => {
    const r = classifyDirection({ price: 100, sma20: 100, sma50: 100, return90Pct: 0, averageSentiment: 1 });
    expect(r.direction).toBe("SIDEWAYS");
  });
});

describe("calculateTargetRange", () => {
  const base = { returnsCount: 61, quoteAgeSessions: 0, splitSuspected: false, high90: null, low90: null };

  it("matches the worked examples", () => {
    const x = calculateTargetRange({ ...base, price: 105, dailyVolatility: 0.018 });
    const y = calculateTargetRange({ ...base, price: 100, dailyVolatility: 0.02 });
    const z = calculateTargetRange({ ...base, price: 250, dailyVolatility: 0.028 });
    if (!x.available || !y.available || !z.available) throw new Error("expected available ranges");
    expect([x.low, x.high].map((v) => +v.toFixed(2))).toEqual([96.88, 113.8]);
    expect([y.low, y.high].map((v) => +v.toFixed(2))).toEqual([91.44, 109.36]);
    expect([z.low, z.high].map((v) => +v.toFixed(2))).toEqual([220.58, 283.35]);
    expect(y.horizonSessions).toBe(20);
  });

  it("flags but does not clip ranges outside the 90-day high/low", () => {
    const r = calculateTargetRange({ ...base, price: 100, dailyVolatility: 0.02, high90: 105, low90: 95 });
    if (!r.available) throw new Error("expected available range");
    expect(r.high).toBeGreaterThan(105);
    expect(r.aboveHistoricalHigh).toBe(true);
    expect(r.belowHistoricalLow).toBe(true);
  });

  it("returns TARGET UNAVAILABLE with a reason", () => {
    const reason = (over: Partial<Parameters<typeof calculateTargetRange>[0]>) => {
      const r = calculateTargetRange({ ...base, price: 100, dailyVolatility: 0.02, ...over });
      return r.available ? "AVAILABLE" : r.reason;
    };
    expect(reason({ price: null })).toBe("NO_VALID_QUOTE");
    expect(reason({ price: 0 })).toBe("NO_VALID_QUOTE");
    expect(reason({ quoteAgeSessions: 6 })).toBe("STALE_QUOTE");
    expect(reason({ quoteAgeSessions: 5 })).toBe("AVAILABLE");
    expect(reason({ dailyVolatility: null })).toBe("INSUFFICIENT_HISTORY");
    expect(reason({ returnsCount: 39 })).toBe("INSUFFICIENT_HISTORY");
    expect(reason({ splitSuspected: true })).toBe("SPLIT_SUSPECTED");
  });
});
