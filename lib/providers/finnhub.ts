import "server-only";
import { z } from "zod";

import { fetchJson, type ClientOptions } from "./http";

/**
 * Finnhub REST client (free plan endpoints only).
 * Response shapes follow https://finnhub.io/docs/api and are re-validated with Zod;
 * see docs/phase-3-verification.md for which shapes have been checked against live responses.
 * The key is sent in the X-Finnhub-Token header so it never appears in a URL.
 */

export const FINNHUB = "Finnhub";
const BASE = "https://finnhub.io/api/v1";

const quoteSchema = z.object({
  c: z.number(), // current / latest price
  d: z.number().nullable(), // change
  dp: z.number().nullable(), // percent change
  h: z.number(),
  l: z.number(),
  o: z.number(),
  pc: z.number(), // previous close
  t: z.number(), // unix seconds
});
export type FinnhubQuote = z.infer<typeof quoteSchema>;

const searchSchema = z.object({
  count: z.number(),
  result: z.array(
    z.object({
      description: z.string(),
      displaySymbol: z.string(),
      symbol: z.string(),
      type: z.string(),
    }),
  ),
});
export type FinnhubSearchResult = z.infer<typeof searchSchema>["result"][number];

// Unknown symbols return `{}`, so every field is optional and checked by the caller.
const profileSchema = z.object({
  name: z.string().optional(),
  ticker: z.string().optional(),
  exchange: z.string().optional(),
  country: z.string().optional(),
  currency: z.string().optional(),
  ipo: z.string().optional(),
});
export type FinnhubProfile = z.infer<typeof profileSchema>;

const newsSchema = z.array(
  z.object({
    category: z.string().optional(),
    datetime: z.number(),
    headline: z.string(),
    id: z.number().optional(),
    related: z.string().optional(),
    source: z.string(),
    summary: z.string().optional(),
    url: z.string(),
  }),
);
export type FinnhubNewsItem = z.infer<typeof newsSchema>[number];

export class FinnhubClient {
  constructor(
    private readonly apiKey: string,
    private readonly options: ClientOptions = {},
  ) {}

  private get<T>(path: string, params: Record<string, string>, schema: z.ZodType<T>) {
    const url = new URL(`${BASE}${path}`);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    return fetchJson({
      provider: FINNHUB,
      url,
      schema,
      headers: { "X-Finnhub-Token": this.apiKey },
      ...this.options,
    }) as Promise<T>;
  }

  quote(symbol: string) {
    return this.get("/quote", { symbol }, quoteSchema);
  }

  search(query: string) {
    return this.get("/search", { q: query, exchange: "US" }, searchSchema);
  }

  profile(symbol: string) {
    return this.get("/stock/profile2", { symbol }, profileSchema);
  }

  companyNews(symbol: string, from: string, to: string) {
    return this.get("/company-news", { symbol, from, to }, newsSchema);
  }
}
