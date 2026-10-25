import { describe, expect, it } from "vitest";

import { calculateConfidence, levelForScore, type ConfidenceInput } from "@/lib/analysis/confidence";

// Worked examples from docs/phase-1-proposal.md §8d (illustrative data, not real stocks).
const exampleX: ConfidenceInput = {
  hasQuote: true,
  closesCount: 62,
  newsCount: 6,
  quoteAgeSessions: 0,
  signals: { s1: 1, s2: 1, s3: 1, s4: 1, s5: 1 },
  direction: "UP",
  annualVolatility: 0.018 * Math.sqrt(252),
  providerStatus: "PRIMARY",
  targetAvailable: true,
};

describe("calculateConfidence", () => {
  it("Example 1 — Stock X scores 100, HIGH", () => {
    const r = calculateConfidence(exampleX);
    expect(r.score).toBe(100);
    expect(r.level).toBe("HIGH");
    expect(r.cappedBy).toBeNull();
  });

  it("Example 2 — Stock Y scores 85, HIGH", () => {
    const r = calculateConfidence({
      ...exampleX,
      newsCount: 4,
      signals: { s1: 0, s2: 1, s3: 1, s4: 0, s5: 0 },
      direction: "SIDEWAYS",
      annualVolatility: 0.02 * Math.sqrt(252),
    });
    expect(r.breakdown).toEqual({
      dataCompleteness: 30,
      quoteFreshness: 15,
      trendConsistency: 15,
      sentimentAgreement: 10,
      volatility: 5,
      providerReliability: 10,
    });
    expect(r.score).toBe(85);
    expect(r.level).toBe("HIGH");
  });

  it("Example 3 — Stock Z scores 80 HIGH, or 70 MEDIUM when one session stale", () => {
    const z: ConfidenceInput = {
      ...exampleX,
      newsCount: 2,
      signals: { s1: -1, s2: -1, s3: -1, s4: 0, s5: null },
      direction: "DOWN",
      annualVolatility: 0.028 * Math.sqrt(252),
      providerStatus: "FALLBACK",
    };
    expect(calculateConfidence(z)).toMatchObject({ score: 80, level: "HIGH" });
    expect(calculateConfidence({ ...z, quoteAgeSessions: 1 })).toMatchObject({ score: 70, level: "MEDIUM" });
  });

  it("scores sentiment contradiction as 0 and a neutral mismatch as 5", () => {
    expect(calculateConfidence({ ...exampleX, signals: { ...exampleX.signals, s5: -1 } }).breakdown.sentimentAgreement).toBe(0);
    expect(calculateConfidence({ ...exampleX, signals: { ...exampleX.signals, s5: 0 } }).breakdown.sentimentAgreement).toBe(5);
  });

  it("caps at LOW without a quote or history, and at MEDIUM without target or direction", () => {
    expect(calculateConfidence({ ...exampleX, hasQuote: false })).toMatchObject({ level: "LOW", cappedBy: "MISSING_QUOTE_OR_HISTORY" });
    expect(calculateConfidence({ ...exampleX, closesCount: 0 }).level).toBe("LOW");
    expect(calculateConfidence({ ...exampleX, targetAvailable: false })).toMatchObject({ level: "MEDIUM", cappedBy: "TARGET_OR_DIRECTION_UNAVAILABLE" });
    expect(calculateConfidence({ ...exampleX, direction: "UNAVAILABLE" }).level).toBe("MEDIUM");
  });

  it("uses the documented level boundaries and volatility bands", () => {
    expect([levelForScore(75), levelForScore(74), levelForScore(50), levelForScore(49)]).toEqual(["HIGH", "MEDIUM", "MEDIUM", "LOW"]);
    const vol = (v: number | null) => calculateConfidence({ ...exampleX, annualVolatility: v }).breakdown.volatility;
    expect([vol(0.29), vol(0.3), vol(0.5), vol(0.51), vol(null)]).toEqual([10, 5, 5, 0, 0]);
  });
});
