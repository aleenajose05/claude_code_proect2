import { vi } from "vitest";

import { AlphaVantageClient } from "@/lib/providers/alphavantage";
import { FinnhubClient } from "@/lib/providers/finnhub";
import { TiingoClient } from "@/lib/providers/tiingo";
import type { ToolContext } from "@/lib/tools/context";

/**
 * TEST-ONLY fake HTTP layer. Bodies below are hand-written in the documented provider
 * formats; they are not real market data and are never used outside automated tests.
 */
export type Route = (url: URL, init: RequestInit) => Response | Promise<Response> | undefined;

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

export interface FakeFetch {
  calls: { url: URL; headers: Record<string, string> }[];
}

export function installFakeFetch(route: Route): FakeFetch {
  const state: FakeFetch = { calls: [] };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init: RequestInit = {}) => {
      const url = new URL(input);
      state.calls.push({ url, headers: (init.headers ?? {}) as Record<string, string> });
      const response = await route(url, init);
      if (!response) throw new Error(`Unexpected request in test: ${url.host}${url.pathname}`);
      return response;
    }),
  );
  return state;
}

export function testContext(now: string, options: { alphaVantage?: boolean } = {}): ToolContext {
  return {
    finnhub: new FinnhubClient("test-finnhub-key"),
    tiingo: new TiingoClient("test-tiingo-key"),
    alphaVantage: options.alphaVantage === false ? null : new AlphaVantageClient("test-av-key"),
    now: () => new Date(now),
  };
}
