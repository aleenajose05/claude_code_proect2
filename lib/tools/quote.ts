import "server-only";

import { AppError, isProviderFailure } from "@/lib/errors";
import {
  classifyQuoteFreshness,
  closeMinutes,
  easternWallTime,
  getMarketStatus,
} from "@/lib/market/calendar";
import { ALPHA_VANTAGE } from "@/lib/providers/alphavantage";
import { FINNHUB } from "@/lib/providers/finnhub";
import type { ToolContext } from "./context";
import { getQuoteInput, quoteOutput, type QuoteResult } from "./schemas";

/** get_quote(ticker): Finnhub first, Alpha Vantage only if Finnhub itself fails. */
export async function getQuote(ctx: ToolContext, rawInput: unknown): Promise<QuoteResult> {
  const { ticker } = getQuoteInput.parse(rawInput);
  const now = ctx.now();
  const market = getMarketStatus(now);
  const base = { ticker, marketStatus: market.status, marketClosedReason: market.reason, fetchedAt: now.toISOString() };

  try {
    const q = await ctx.finnhub.quote(ticker);
    // Finnhub answers unknown symbols with zeros rather than an error.
    if (q.c <= 0 || q.t <= 0 || q.pc <= 0) {
      throw new AppError("DATA_UNAVAILABLE", `No quote is available for ${ticker}.`, { provider: FINNHUB });
    }
    if (q.d === null || q.dp === null) {
      throw new AppError("INVALID_PROVIDER_RESPONSE", `${FINNHUB} quote for ${ticker} was incomplete`, { provider: FINNHUB });
    }
    const quoteTime = new Date(q.t * 1000);
    return quoteOutput.parse({
      ...base,
      price: q.c,
      change: q.d,
      changePercent: q.dp,
      previousClose: q.pc,
      provider: FINNHUB,
      quoteTime: quoteTime.toISOString(),
      quoteTimeIsDateOnly: false,
      ...classifyQuoteFreshness(quoteTime, now),
      usedFallback: false,
    });
  } catch (error) {
    if (!isProviderFailure(error) || !ctx.alphaVantage) throw error;
  }

  const av = await ctx.alphaVantage.globalQuote(ticker);
  if (!av || av.price <= 0 || av.previousClose <= 0) {
    throw new AppError("DATA_UNAVAILABLE", `No quote is available for ${ticker}.`, { provider: ALPHA_VANTAGE });
  }
  // Alpha Vantage gives only a trading date, so the quote is stamped at that session's close
  // and can never be labelled INTRADAY.
  const quoteTime = easternWallTime(av.latestTradingDay, closeMinutes(av.latestTradingDay));
  const classified = classifyQuoteFreshness(quoteTime, now);
  const freshness = classified.freshness === "INTRADAY" ? "DELAYED" : classified.freshness;
  return quoteOutput.parse({
    ...base,
    price: av.price,
    change: av.change,
    changePercent: av.changePercent,
    previousClose: av.previousClose,
    provider: ALPHA_VANTAGE,
    quoteTime: quoteTime.toISOString(),
    quoteTimeIsDateOnly: true,
    freshness,
    quoteAgeSessions: classified.quoteAgeSessions,
    usedFallback: true,
  });
}
