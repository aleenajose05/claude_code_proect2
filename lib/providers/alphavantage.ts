import "server-only";
import { z } from "zod";

import type { Candle } from "@/lib/analysis/types";
import { AppError } from "@/lib/errors";
import { fetchJson, type ClientOptions } from "./http";

/**
 * Alpha Vantage fallback (https://www.alphavantage.co/documentation/).
 * Free plan: ~25 requests/day. The API only accepts the key as a query parameter,
 * so URLs from this module must never be logged (fetchJson only reports host + path).
 * Rate-limit and error responses arrive as HTTP 200 with a "Note"/"Information"/"Error Message" field.
 */

export const ALPHA_VANTAGE = "Alpha Vantage";

const notice = z.object({
  Note: z.string().optional(),
  Information: z.string().optional(),
  "Error Message": z.string().optional(),
});

const globalQuoteSchema = notice.extend({
  "Global Quote": z
    .object({
      "01. symbol": z.string(),
      "05. price": z.string(),
      "07. latest trading day": z.string(),
      "08. previous close": z.string(),
      "09. change": z.string(),
      "10. change percent": z.string(),
    })
    .partial()
    .optional(),
});

const dailySchema = notice.extend({
  "Time Series (Daily)": z
    .record(
      z.string(),
      z.object({
        "1. open": z.string(),
        "2. high": z.string(),
        "3. low": z.string(),
        "4. close": z.string(),
        "5. volume": z.string(),
      }),
    )
    .optional(),
});

export interface AlphaVantageQuote {
  symbol: string;
  price: number;
  previousClose: number;
  change: number;
  changePercent: number;
  latestTradingDay: string;
}

function checkNotice(body: z.infer<typeof notice>) {
  if (body.Note || body.Information) {
    throw new AppError("PROVIDER_QUOTA", `${ALPHA_VANTAGE} rate limit or plan restriction reached`, {
      provider: ALPHA_VANTAGE,
    });
  }
}

function num(value: string | undefined): number {
  const n = Number(value?.replace("%", ""));
  return Number.isFinite(n) ? n : Number.NaN;
}

export class AlphaVantageClient {
  constructor(
    private readonly apiKey: string,
    private readonly options: ClientOptions = {},
  ) {}

  private request<T>(params: Record<string, string>, schema: z.ZodType<T>) {
    const url = new URL("https://www.alphavantage.co/query");
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    url.searchParams.set("apikey", this.apiKey);
    return fetchJson({ provider: ALPHA_VANTAGE, url, schema, ...this.options }) as Promise<T>;
  }

  /** null when the symbol is unknown. */
  async globalQuote(symbol: string): Promise<AlphaVantageQuote | null> {
    const body = await this.request({ function: "GLOBAL_QUOTE", symbol }, globalQuoteSchema);
    checkNotice(body);
    const q = body["Global Quote"];
    if (body["Error Message"] || !q || !q["01. symbol"]) return null;
    const quote = {
      symbol: q["01. symbol"],
      price: num(q["05. price"]),
      previousClose: num(q["08. previous close"]),
      change: num(q["09. change"]),
      changePercent: num(q["10. change percent"]),
      latestTradingDay: q["07. latest trading day"] ?? "",
    };
    if (![quote.price, quote.previousClose, quote.change, quote.changePercent].every(Number.isFinite) || !/^\d{4}-\d{2}-\d{2}$/.test(quote.latestTradingDay)) {
      throw new AppError("INVALID_PROVIDER_RESPONSE", `${ALPHA_VANTAGE} quote had unexpected values`, { provider: ALPHA_VANTAGE });
    }
    return quote;
  }

  /** Unadjusted daily candles (compact = ~100 most recent sessions), or null when unknown. */
  async dailyPrices(symbol: string): Promise<Candle[] | null> {
    const body = await this.request({ function: "TIME_SERIES_DAILY", symbol, outputsize: "compact" }, dailySchema);
    checkNotice(body);
    const series = body["Time Series (Daily)"];
    if (body["Error Message"] || !series) return null;
    return Object.entries(series).map(([date, bar]) => ({
      date,
      open: num(bar["1. open"]),
      high: num(bar["2. high"]),
      low: num(bar["3. low"]),
      close: num(bar["4. close"]),
      volume: num(bar["5. volume"]),
    }));
  }
}
