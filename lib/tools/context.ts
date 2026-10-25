import "server-only";

import { getEnv } from "@/lib/env";
import { AlphaVantageClient } from "@/lib/providers/alphavantage";
import { FinnhubClient } from "@/lib/providers/finnhub";
import { TiingoClient } from "@/lib/providers/tiingo";

export interface ToolContext {
  finnhub: FinnhubClient;
  tiingo: TiingoClient;
  /** null when ALPHA_VANTAGE_API_KEY is not configured. */
  alphaVantage: AlphaVantageClient | null;
  now: () => Date;
}

export function createToolContext(signal?: AbortSignal): ToolContext {
  const env = getEnv();
  return {
    finnhub: new FinnhubClient(env.FINNHUB_API_KEY, signal),
    tiingo: new TiingoClient(env.TIINGO_API_KEY, signal),
    alphaVantage: env.ALPHA_VANTAGE_API_KEY ? new AlphaVantageClient(env.ALPHA_VANTAGE_API_KEY, signal) : null,
    now: () => new Date(),
  };
}
