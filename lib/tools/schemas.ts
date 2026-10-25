import { z } from "zod";

/**
 * Validated input/output contracts for the four financial tools. Inputs are what the
 * LLM may send; outputs are what the server trusts and renders.
 */

/** US exchange symbol: 1–5 letters, optional one-letter class suffix (BRK.B). */
export const tickerSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{1,5}(\.[A-Z])?$/, "Invalid ticker format");

export const resolveTickerInput = z.object({ query: z.string().trim().min(1).max(100) }).strict();
export const getQuoteInput = z.object({ ticker: tickerSchema }).strict();
export const getPriceHistoryInput = z
  .object({ ticker: tickerSchema, days: z.literal(90).default(90) })
  .strict();
export const getNewsSentimentInput = z.object({ ticker: tickerSchema }).strict();

const isoTimestamp = z.iso.datetime();

export const resolvedTickerSchema = z.object({
  status: z.literal("RESOLVED"),
  ticker: tickerSchema,
  companyName: z.string(),
  exchange: z.string(),
  country: z.string().nullable(),
  instrumentType: z.literal("Common Stock"),
  /** Set when an approved default was applied, e.g. Google → GOOGL. */
  notice: z.string().nullable(),
});

export const unresolvedTickerSchema = z.object({
  status: z.enum(["NOT_FOUND", "AMBIGUOUS", "UNSUPPORTED_INSTRUMENT", "NOT_LISTED"]),
  query: z.string(),
  message: z.string(),
  candidates: z.array(z.object({ ticker: z.string(), name: z.string(), type: z.string() })),
});

export const resolveTickerOutput = z.discriminatedUnion("status", [resolvedTickerSchema, unresolvedTickerSchema]);
export type ResolveTickerResult = z.infer<typeof resolveTickerOutput>;

export const freshnessSchema = z.enum(["INTRADAY", "DELAYED", "PREVIOUS_CLOSE", "STALE", "UNKNOWN"]);
export const marketStatusSchema = z.enum(["OPEN", "PRE_MARKET", "AFTER_HOURS", "CLOSED", "UNKNOWN"]);

export const quoteOutput = z.object({
  ticker: tickerSchema,
  price: z.number().positive(),
  change: z.number(),
  changePercent: z.number(),
  previousClose: z.number().positive(),
  marketStatus: marketStatusSchema,
  marketClosedReason: z.enum(["WEEKEND", "HOLIDAY", "OVERNIGHT"]).nullable(),
  provider: z.string(),
  quoteTime: isoTimestamp,
  /** true when the provider only gives a trading date, not a time (Alpha Vantage). */
  quoteTimeIsDateOnly: z.boolean(),
  fetchedAt: isoTimestamp,
  freshness: freshnessSchema,
  quoteAgeSessions: z.number().int().nonnegative().nullable(),
  usedFallback: z.boolean(),
});
export type QuoteResult = z.infer<typeof quoteOutput>;

export const candleSchema = z.object({
  date: z.iso.date(),
  open: z.number().positive(),
  high: z.number().positive(),
  low: z.number().positive(),
  close: z.number().positive(),
  volume: z.number().nonnegative(),
});

export const priceHistoryOutput = z.object({
  ticker: tickerSchema,
  /** Calendar-day window requested. */
  days: z.literal(90),
  from: z.iso.date(),
  to: z.iso.date(),
  candles: z.array(candleSchema),
  adjusted: z.boolean(),
  provider: z.string(),
  fetchedAt: isoTimestamp,
  usedFallback: z.boolean(),
});
export type PriceHistoryResult = z.infer<typeof priceHistoryOutput>;

export const newsItemSchema = z.object({
  id: z.string(),
  headline: z.string(),
  publisher: z.string(),
  publishedAt: isoTimestamp,
  url: z.url({ protocol: /^https?$/ }),
  sentimentScore: z.number().min(-1).max(1),
  sentimentLabel: z.enum(["POSITIVE", "NEGATIVE", "NEUTRAL"]),
});

export const newsSentimentOutput = z.object({
  ticker: tickerSchema,
  items: z.array(newsItemSchema),
  averageSentiment: z.number().min(-1).max(1).nullable(),
  sentimentSource: z.string(),
  provider: z.string(),
  windowDays: z.number().int().positive(),
  fetchedAt: isoTimestamp,
});
export type NewsSentimentResult = z.infer<typeof newsSentimentOutput>;
