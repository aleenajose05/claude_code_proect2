import "server-only";

import type { FinnhubSearchResult } from "@/lib/providers/finnhub";
import type { ToolContext } from "./context";
import { resolveTickerInput, resolveTickerOutput, type ResolveTickerResult } from "./schemas";

/**
 * resolve_ticker(query): maps a company name or symbol to a verified US-listed common stock.
 * Every result, including curated aliases, is verified against Finnhub search (instrument
 * type) and company profile (current listing) before it is returned.
 */

const GOOGLE_NOTICE =
  "Alphabet (Google) has two listed share classes. GOOGL (Class A) was used by default; ask about GOOG for Class C.";

/** Curated, unambiguous company names. Share-class companies without an approved default are left out. */
const ALIASES: Record<string, string> = {
  apple: "AAPL",
  microsoft: "MSFT",
  nvidia: "NVDA",
  amazon: "AMZN",
  "amazon com": "AMZN",
  google: "GOOGL",
  alphabet: "GOOGL",
  meta: "META",
  "meta platforms": "META",
  facebook: "META",
  tesla: "TSLA",
  netflix: "NFLX",
  jpmorgan: "JPM",
  "jpmorgan chase": "JPM",
  "jp morgan": "JPM",
  visa: "V",
  walmart: "WMT",
  intel: "INTC",
  amd: "AMD",
  "advanced micro devices": "AMD",
  "coca cola": "KO",
  disney: "DIS",
  "walt disney": "DIS",
  nike: "NKE",
  boeing: "BA",
  oracle: "ORCL",
  salesforce: "CRM",
  adobe: "ADBE",
  paypal: "PYPL",
  ibm: "IBM",
  cisco: "CSCO",
  pepsico: "PEP",
  pepsi: "PEP",
  mcdonalds: "MCD",
  starbucks: "SBUX",
  exxon: "XOM",
  exxonmobil: "XOM",
  "exxon mobil": "XOM",
  chevron: "CVX",
  pfizer: "PFE",
  "johnson and johnson": "JNJ",
  broadcom: "AVGO",
  costco: "COST",
  uber: "UBER",
  palantir: "PLTR",
};

const FILLER_WORDS = new Set([
  "the", "stock", "stocks", "share", "shares", "inc", "incorporated", "corp", "corporation",
  "co", "company", "ltd", "plc", "holdings", "group", "class",
]);

export function normalizeName(text: string): string {
  return text
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’]s\b/g, "s")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word && !FILLER_WORDS.has(word))
    .join(" ");
}

const TICKER_PATTERN = /^\$?([A-Za-z]{1,5}(?:\.[A-Za-z])?)$/;

/** Only uppercase or $-prefixed input counts as an explicit ticker ("ford" is not FORD). */
function explicitTicker(query: string): string | null {
  const match = TICKER_PATTERN.exec(query);
  if (!match) return null;
  if (query.startsWith("$") || match[1] === match[1].toUpperCase()) return match[1].toUpperCase();
  return null;
}

function googleShareClass(query: string): { ticker: string; notice: string | null } | null {
  const q = query.toLowerCase();
  if (!/\b(google|alphabet)\b/.test(q)) return null;
  if (/\bgoog\b|class\s*c\b/.test(q)) return { ticker: "GOOG", notice: null };
  if (/\bgoogl\b|class\s*a\b/.test(q)) return { ticker: "GOOGL", notice: null };
  return { ticker: "GOOGL", notice: GOOGLE_NOTICE };
}

const US_TICKER = /^[A-Z]{1,5}(\.[A-Z])?$/;
const MAX_CANDIDATES = 5;

function toCandidates(results: FinnhubSearchResult[]) {
  return results.slice(0, MAX_CANDIDATES).map((r) => ({ ticker: r.symbol, name: r.description, type: r.type }));
}

async function verify(
  ctx: ToolContext,
  query: string,
  ticker: string,
  notice: string | null,
): Promise<ResolveTickerResult> {
  const [search, profile] = await Promise.all([ctx.finnhub.search(ticker), ctx.finnhub.profile(ticker)]);
  const listing = search.result.find((r) => r.symbol === ticker);

  if (!listing) {
    return {
      status: "NOT_FOUND",
      query,
      message: `No US listing was found for ${ticker}.`,
      candidates: [],
    };
  }
  if (listing.type !== "Common Stock") {
    return {
      status: "UNSUPPORTED_INSTRUMENT",
      query,
      message: `${ticker} is classified as "${listing.type}". Only US-listed common stocks are supported (no ETFs, ADRs, funds, options or crypto).`,
      candidates: [],
    };
  }
  const exchange = profile.exchange ?? "";
  if (!profile.name || /\b(OTC|PINK)\b/i.test(exchange) || (profile.currency && profile.currency !== "USD")) {
    return {
      status: "NOT_LISTED",
      query,
      message: `${ticker} has no current US exchange listing data. It may be delisted or traded only over the counter.`,
      candidates: [],
    };
  }

  return resolveTickerOutput.parse({
    status: "RESOLVED",
    ticker,
    companyName: profile.name,
    exchange,
    country: profile.country ?? null,
    instrumentType: "Common Stock",
    notice,
  });
}

export async function resolveTicker(ctx: ToolContext, rawInput: unknown): Promise<ResolveTickerResult> {
  const { query } = resolveTickerInput.parse(rawInput);

  const google = googleShareClass(query);
  if (google) return verify(ctx, query, google.ticker, google.notice);

  const explicit = explicitTicker(query);
  if (explicit) return verify(ctx, query, explicit, null);

  const normalized = normalizeName(query);
  if (!normalized) {
    return { status: "NOT_FOUND", query, message: "No company name or ticker was recognised.", candidates: [] };
  }
  const alias = ALIASES[normalized];
  if (alias) return verify(ctx, query, alias, null);

  const { result } = await ctx.finnhub.search(normalized);
  const usResults = result.filter((r) => US_TICKER.test(r.symbol));
  const nameMatches = usResults.filter((r) => {
    const name = normalizeName(r.description);
    return name === normalized || name.startsWith(`${normalized} `);
  });
  const commonMatches = nameMatches.filter((r) => r.type === "Common Stock");

  if (commonMatches.length === 1) return verify(ctx, query, commonMatches[0].symbol, null);
  if (commonMatches.length > 1) {
    return {
      status: "AMBIGUOUS",
      query,
      message: `"${query}" matches more than one listed stock. Please say which one you mean.`,
      candidates: toCandidates(commonMatches),
    };
  }
  if (nameMatches.length > 0) {
    return {
      status: "UNSUPPORTED_INSTRUMENT",
      query,
      message: `"${query}" matched only non-common-stock instruments. Only US-listed common stocks are supported.`,
      candidates: toCandidates(nameMatches),
    };
  }
  const suggestions = usResults.filter((r) => r.type === "Common Stock");
  return {
    status: suggestions.length ? "AMBIGUOUS" : "NOT_FOUND",
    query,
    message: suggestions.length
      ? `No exact match for "${query}". Did you mean one of these?`
      : `No US-listed company matching "${query}" was found.`,
    candidates: toCandidates(suggestions),
  };
}
