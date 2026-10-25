import "server-only";
import { z } from "zod";

import type { Candle } from "@/lib/analysis/types";
import { fetchJson } from "./http";

/**
 * Tiingo end-of-day prices (https://www.tiingo.com/documentation/end-of-day).
 * Uses the split/dividend-adjusted fields. Key goes in the Authorization header.
 */

export const TIINGO = "Tiingo";

const pricesSchema = z.array(
  z.object({
    date: z.string(),
    adjOpen: z.number(),
    adjHigh: z.number(),
    adjLow: z.number(),
    adjClose: z.number(),
    adjVolume: z.number(),
  }),
);

export class TiingoClient {
  constructor(
    private readonly apiKey: string,
    private readonly signal?: AbortSignal,
  ) {}

  /** Adjusted daily candles, or null when Tiingo does not know the ticker (HTTP 404). */
  async dailyPrices(symbol: string, startDate: string, endDate: string): Promise<Candle[] | null> {
    // Tiingo uses "-" where exchanges use "." for share classes (BRK.B → BRK-B).
    const url = new URL(`https://api.tiingo.com/tiingo/daily/${encodeURIComponent(symbol.replace(".", "-"))}/prices`);
    url.searchParams.set("startDate", startDate);
    url.searchParams.set("endDate", endDate);
    const rows = await fetchJson({
      provider: TIINGO,
      url,
      schema: pricesSchema,
      headers: { Authorization: `Token ${this.apiKey}` },
      signal: this.signal,
      nullOnStatus: [404],
    });
    if (rows === null) return null;
    return rows.map((row) => ({
      date: row.date.slice(0, 10),
      open: row.adjOpen,
      high: row.adjHigh,
      low: row.adjLow,
      close: row.adjClose,
      volume: row.adjVolume,
    }));
  }
}
