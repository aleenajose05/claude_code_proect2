import "server-only";

import { cleanCandles } from "@/lib/analysis/indicators";
import type { Candle } from "@/lib/analysis/types";
import { AppError, isProviderFailure } from "@/lib/errors";
import { addDays, toEastern } from "@/lib/market/calendar";
import { ALPHA_VANTAGE } from "@/lib/providers/alphavantage";
import { TIINGO } from "@/lib/providers/tiingo";
import type { ToolContext } from "./context";
import { getPriceHistoryInput, priceHistoryOutput, type PriceHistoryResult } from "./schemas";

/**
 * get_price_history(ticker, days=90): daily candles for the last 90 *calendar* days
 * (≈ 61–63 sessions). Tiingo adjusted prices first; Alpha Vantage unadjusted as fallback.
 */
export async function getPriceHistory(ctx: ToolContext, rawInput: unknown): Promise<PriceHistoryResult> {
  const { ticker, days } = getPriceHistoryInput.parse(rawInput);
  const now = ctx.now();
  const to = toEastern(now).date;
  const from = addDays(to, -days);
  const inWindow = (candles: Candle[]) => cleanCandles(candles).filter((c) => c.date >= from && c.date <= to);

  let candles: Candle[] | null = null;
  let provider = TIINGO;
  let adjusted = true;
  try {
    candles = await ctx.tiingo.dailyPrices(ticker, from, to);
  } catch (error) {
    if (!isProviderFailure(error) || !ctx.alphaVantage) throw error;
    candles = await ctx.alphaVantage.dailyPrices(ticker);
    provider = ALPHA_VANTAGE;
    adjusted = false;
  }

  const windowed = candles ? inWindow(candles) : [];
  if (windowed.length === 0) {
    throw new AppError("DATA_UNAVAILABLE", `No daily price history is available for ${ticker}.`, { provider });
  }
  return priceHistoryOutput.parse({
    ticker,
    days,
    from,
    to,
    candles: windowed,
    adjusted,
    provider,
    fetchedAt: now.toISOString(),
    usedFallback: provider !== TIINGO,
  });
}
