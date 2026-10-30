import type { Horizon } from "./horizon";
import { calculateConfidence, type ConfidenceResult, type ProviderStatus } from "./confidence";
import {
  calculateTargetRange,
  classifyDirection,
  computeIndicators,
  type DirectionResult,
  type Indicators,
  type TargetRange,
} from "./indicators";
import type {
  NewsSentimentResult,
  PriceHistoryResult,
  QuoteResult,
  ResolveTickerResult,
} from "@/lib/tools/schemas";

/**
 * Combines verified tool results into one stock analysis. Every number shown to the
 * user comes from here. The evidence catalog is the only material the LLM may cite.
 */

export type ResolvedTicker = Extract<ResolveTickerResult, { status: "RESOLVED" }>;

export type Outcome<T> = { ok: true; value: T; cache: CacheStatus } | { ok: false; error: string };
export type CacheStatus = "HIT" | "MISS" | "BYPASS";

export interface EvidenceItem {
  id: string;
  label: string;
  /** Human-readable value exactly as it may be quoted. */
  value: string;
}

export interface StockAnalysis {
  company: ResolvedTicker;
  quote: QuoteResult | null;
  history: PriceHistoryResult | null;
  news: NewsSentimentResult | null;
  indicators: Indicators | null;
  direction: DirectionResult;
  target: TargetRange;
  /** Range for the period the user asked about ("after 60 days"), when they named one. */
  askedTarget: { horizon: Horizon; range: TargetRange } | null;
  confidence: ConfidenceResult;
  evidence: EvidenceItem[];
  /** Plain-language notes about data that could not be retrieved or was degraded. */
  missing: string[];
  cache: { quote: CacheStatus | null; history: CacheStatus | null; news: CacheStatus | null };
}

export const usd = (n: number) => `${n < 0 ? "-" : ""}$${Math.abs(n).toFixed(2)}`;
const pct = (n: number, digits = 2) => `${n >= 0 ? "+" : ""}${n.toFixed(digits)}%`;

const TARGET_REASON_TEXT: Record<Extract<TargetRange, { available: false }>["reason"], string> = {
  NO_VALID_QUOTE: "no valid quote",
  INSUFFICIENT_HISTORY: "fewer than 40 daily returns in the 90-day window",
  STALE_QUOTE: "the quote is more than 5 trading sessions old",
  SPLIT_SUSPECTED: "the fallback history is unadjusted and contains a split-like jump",
};

export function targetUnavailableText(target: TargetRange): string | null {
  return target.available ? null : `Target unavailable: ${TARGET_REASON_TEXT[target.reason]}.`;
}

export function buildStockAnalysis(input: {
  company: ResolvedTicker;
  quote: Outcome<QuoteResult>;
  history: Outcome<PriceHistoryResult>;
  news: Outcome<NewsSentimentResult>;
  horizon?: Horizon | null;
}): StockAnalysis {
  const quote = input.quote.ok ? input.quote.value : null;
  const history = input.history.ok ? input.history.value : null;
  const news = input.news.ok ? input.news.value : null;
  const missing: string[] = [];
  if (!input.quote.ok) missing.push(`Quote unavailable: ${input.quote.error}`);
  if (!input.history.ok) missing.push(`Price history unavailable: ${input.history.error}`);
  if (!input.news.ok) missing.push(`News unavailable: ${input.news.error}`);

  const indicators = history ? computeIndicators(history.candles, { adjusted: history.adjusted }) : null;
  if (history && !history.adjusted) {
    missing.push("Price history comes from an unadjusted fallback source, so splits and dividends are not adjusted.");
  }
  if (indicators && indicators.gaps.length > 0) {
    missing.push(`Price history has ${indicators.gaps.length} gap(s) of more than 3 weekdays without data.`);
  }
  if (news && news.averageSentiment === null) {
    missing.push(`Fewer than 3 recent articles were found, so news sentiment is not used in the direction.`);
  }

  const price = quote?.price ?? null;
  const direction = classifyDirection({
    price,
    sma20: indicators?.sma20 ?? null,
    sma50: indicators?.sma50 ?? null,
    return90Pct: indicators?.return90Pct ?? null,
    averageSentiment: news?.averageSentiment ?? null,
  });
  const target = calculateTargetRange({
    price,
    dailyVolatility: indicators?.dailyVolatility ?? null,
    returnsCount: indicators?.returnsCount ?? 0,
    quoteAgeSessions: quote?.quoteAgeSessions ?? null,
    splitSuspected: indicators?.splitSuspected ?? false,
    high90: indicators?.high90 ?? null,
    low90: indicators?.low90 ?? null,
  });

  const askedTarget = input.horizon
    ? {
        horizon: input.horizon,
        range: calculateTargetRange({
          price,
          dailyVolatility: indicators?.dailyVolatility ?? null,
          returnsCount: indicators?.returnsCount ?? 0,
          quoteAgeSessions: quote?.quoteAgeSessions ?? null,
          splitSuspected: indicators?.splitSuspected ?? false,
          high90: indicators?.high90 ?? null,
          low90: indicators?.low90 ?? null,
          horizonSessions: input.horizon.sessions,
        }),
      }
    : null;

  const anyFallback = Boolean(quote?.usedFallback || history?.usedFallback);
  const providerStatus: ProviderStatus = !quote || !history || !news ? "PARTIAL" : anyFallback ? "FALLBACK" : "PRIMARY";
  const confidence = calculateConfidence({
    hasQuote: quote !== null,
    closesCount: indicators?.closesCount ?? 0,
    newsCount: news?.items.length ?? 0,
    quoteAgeSessions: quote?.quoteAgeSessions ?? null,
    signals: direction.signals,
    direction: direction.direction,
    annualVolatility: indicators?.annualVolatility ?? null,
    providerStatus,
    targetAvailable: target.available,
  });

  const evidence: EvidenceItem[] = [];
  const add = (id: string, label: string, value: string | null) => {
    if (value !== null) evidence.push({ id, label, value });
  };
  add("M:PRICE", "Latest price", quote ? usd(quote.price) : null);
  add("M:CHANGE", "Change vs previous close", quote ? `${usd(quote.change)} (${pct(quote.changePercent)})` : null);
  add("M:SMA20", "20-day simple moving average", indicators?.sma20 != null ? usd(indicators.sma20) : null);
  add("M:SMA50", "50-day simple moving average", indicators?.sma50 != null ? usd(indicators.sma50) : null);
  add("M:R90", "Return over the 90-day window", indicators?.return90Pct != null ? pct(indicators.return90Pct) : null);
  add(
    "M:VOL",
    "Annualised volatility (from daily returns)",
    indicators?.annualVolatility != null ? `${(indicators.annualVolatility * 100).toFixed(1)}%` : null,
  );
  add("M:HIGH90", "90-day high", indicators?.high90 != null ? usd(indicators.high90) : null);
  add("M:LOW90", "90-day low", indicators?.low90 != null ? usd(indicators.low90) : null);
  add("M:DIRECTION", "Rule-based direction", direction.direction);
  add(
    "M:TARGET",
    "Statistical range, next ~20 trading days (≈68%)",
    target.available ? `${usd(target.low)} – ${usd(target.high)}` : "unavailable",
  );
  if (askedTarget) {
    add(
      "M:TARGET_ASKED",
      `Statistical range for the period asked about (${askedTarget.horizon.label}, ≈68%); an exact future price cannot be known`,
      askedTarget.range.available
        ? `${usd(askedTarget.range.low)} – ${usd(askedTarget.range.high)} over ${askedTarget.horizon.label}`
        : `unavailable over ${askedTarget.horizon.label}`,
    );
  }
  add("M:CONFIDENCE", "Confidence in the assessment", confidence.level);
  add(
    "M:SENTIMENT",
    "Average news sentiment (−1 to +1)",
    news?.averageSentiment != null ? news.averageSentiment.toFixed(2) : null,
  );
  news?.items.forEach((item, i) =>
    add(`N:${i + 1}`, `News: ${item.publisher}`, `"${item.headline}" (sentiment ${item.sentimentScore.toFixed(2)}, ${item.sentimentLabel})`),
  );

  return {
    company: input.company,
    quote,
    history,
    news,
    indicators,
    direction,
    target,
    askedTarget,
    confidence,
    evidence,
    missing,
    cache: {
      quote: input.quote.ok ? input.quote.cache : null,
      history: input.history.ok ? input.history.cache : null,
      news: input.news.ok ? input.news.cache : null,
    },
  };
}
