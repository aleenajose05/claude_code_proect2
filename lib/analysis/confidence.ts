import type { ConfidenceLevel, Direction } from "./types";
import type { DirectionSignals } from "./indicators";

/**
 * Rule-based confidence (docs/phase-1-proposal.md §8c). It measures how complete and
 * consistent the data is, not the probability that the stock moves as described.
 */

export type ProviderStatus = "PRIMARY" | "FALLBACK" | "PARTIAL";

export interface ConfidenceInput {
  hasQuote: boolean;
  closesCount: number;
  newsCount: number;
  /** Trading sessions between the quote and the latest session (0 = current), null if no quote. */
  quoteAgeSessions: number | null;
  signals: DirectionSignals;
  direction: Direction;
  annualVolatility: number | null;
  providerStatus: ProviderStatus;
  targetAvailable: boolean;
}

export interface ConfidenceBreakdown {
  dataCompleteness: number;
  quoteFreshness: number;
  trendConsistency: number;
  sentimentAgreement: number;
  volatility: number;
  providerReliability: number;
}

export interface ConfidenceResult {
  level: ConfidenceLevel;
  score: number;
  breakdown: ConfidenceBreakdown;
  /** Present when a cap lowered the level below what the score alone gives. */
  cappedBy: "MISSING_QUOTE_OR_HISTORY" | "TARGET_OR_DIRECTION_UNAVAILABLE" | null;
}

const LEVEL_RANK: Record<ConfidenceLevel, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 };

export function levelForScore(score: number): ConfidenceLevel {
  if (score >= 75) return "HIGH";
  if (score >= 50) return "MEDIUM";
  return "LOW";
}

function directionSign(direction: Direction): -1 | 0 | 1 | null {
  if (direction === "UP") return 1;
  if (direction === "DOWN") return -1;
  if (direction === "SIDEWAYS") return 0;
  return null;
}

export function calculateConfidence(input: ConfidenceInput): ConfidenceResult {
  const dataCompleteness =
    (input.hasQuote ? 10 : 0) +
    (input.closesCount >= 50 ? 10 : input.closesCount >= 40 ? 5 : 0) +
    (input.newsCount >= 3 ? 10 : input.newsCount >= 1 ? 5 : 0);

  const quoteFreshness =
    input.quoteAgeSessions === 0 ? 15 : input.quoteAgeSessions === 1 ? 5 : 0;

  const priceSignals = [input.signals.s1, input.signals.s2, input.signals.s3, input.signals.s4].filter(
    (s): s is -1 | 0 | 1 => s !== null,
  );
  const nonZero = priceSignals.filter((s) => s !== 0);
  const allSameSign = nonZero.length > 0 && nonZero.every((s) => s === nonZero[0]);
  const signalSum = priceSignals.reduce<number>((sum, s) => sum + s, 0);
  const trendConsistency = nonZero.length >= 3 && allSameSign ? 25 : Math.abs(signalSum) >= 2 ? 15 : 5;

  // Agreement: sentiment sign equals direction sign (UP/+1, DOWN/−1, SIDEWAYS/0).
  // Contradiction: opposite non-zero signs. Anything else (insufficient sentiment,
  // unavailable direction, or one side neutral) is neither and scores 5.
  const sentiment = input.signals.s5;
  const dirSign = directionSign(input.direction);
  let sentimentAgreement = 5;
  if (sentiment !== null && dirSign !== null) {
    if (sentiment === dirSign) sentimentAgreement = 10;
    else if (sentiment !== 0 && dirSign !== 0) sentimentAgreement = 0;
  }

  const vol = input.annualVolatility;
  const volatility = vol === null ? 0 : vol < 0.3 ? 10 : vol <= 0.5 ? 5 : 0;

  const providerReliability =
    input.providerStatus === "PRIMARY" ? 10 : input.providerStatus === "FALLBACK" ? 5 : 0;

  const breakdown = {
    dataCompleteness,
    quoteFreshness,
    trendConsistency,
    sentimentAgreement,
    volatility,
    providerReliability,
  };
  const score = Object.values(breakdown).reduce((sum, v) => sum + v, 0);

  let level = levelForScore(score);
  let cappedBy: ConfidenceResult["cappedBy"] = null;
  if (!input.hasQuote || input.closesCount === 0) {
    if (LEVEL_RANK[level] > LEVEL_RANK.LOW) cappedBy = "MISSING_QUOTE_OR_HISTORY";
    level = "LOW";
  } else if (!input.targetAvailable || input.direction === "UNAVAILABLE") {
    if (LEVEL_RANK[level] > LEVEL_RANK.MEDIUM) {
      cappedBy = "TARGET_OR_DIRECTION_UNAVAILABLE";
      level = "MEDIUM";
    }
  }

  return { level, score, breakdown, cappedBy };
}
