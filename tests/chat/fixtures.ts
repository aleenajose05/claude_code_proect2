import type { LlmClient, LlmRequest, LlmResponse } from "@/lib/llm/gemini";
import { installFakeFetch, json } from "../tools/fake-fetch";

/**
 * TEST-ONLY synthetic market data for two made-up stocks. Never used outside automated tests.
 * NOW is Monday 2026-10-26 10:00 ET (market open).
 */
export const NOW = "2026-10-26T14:00:00Z";

const COMPANIES = {
  AAPL: { name: "Apple Inc", base: 100, step: 0.4 },
  MSFT: { name: "Microsoft Corp", base: 300, step: -0.6 },
  NVDA: { name: "NVIDIA Corp", base: 150, step: 0.1 },
} as const;
type Sym = keyof typeof COMPANIES;

function weekdays(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = Date.parse(`${from}T00:00:00Z`); d <= Date.parse(`${to}T00:00:00Z`); d += 86_400_000) {
    const day = new Date(d).getUTCDay();
    if (day !== 0 && day !== 6) out.push(new Date(d).toISOString().slice(0, 10));
  }
  return out;
}

export function installMarketFakes(options: { headline?: string } = {}) {
  return installFakeFetch((url) => {
    const symbol = (url.searchParams.get("symbol") ?? url.pathname.split("/")[3] ?? "").toUpperCase() as Sym;
    if (url.host === "finnhub.io") {
      if (url.pathname === "/api/v1/search") {
        const q = url.searchParams.get("q")!.toUpperCase();
        const hit = Object.entries(COMPANIES).find(([s, c]) => s === q || c.name.toUpperCase().includes(q));
        return json({ count: hit ? 1 : 0, result: hit ? [{ symbol: hit[0], displaySymbol: hit[0], description: hit[1].name.toUpperCase(), type: "Common Stock" }] : [] });
      }
      const company = COMPANIES[symbol];
      if (url.pathname === "/api/v1/stock/profile2") {
        return json(company ? { name: company.name, ticker: symbol, exchange: "NASDAQ NMS - GLOBAL MARKET", country: "US", currency: "USD" } : {});
      }
      if (url.pathname === "/api/v1/quote") {
        const last = company.base + company.step * 62;
        return json({ c: last, d: company.step, dp: (company.step / (last - company.step)) * 100, h: last + 1, l: last - 1, o: last, pc: last - company.step, t: Date.parse("2026-10-26T13:58:00Z") / 1000 });
      }
      if (url.pathname === "/api/v1/company-news") {
        const t = (h: number) => Date.parse(NOW) / 1000 - h * 3600;
        return json([
          { datetime: t(2), headline: options.headline ?? `${company.name} shares surge on strong demand`, source: "Test Wire", url: "https://example.com/1", related: symbol },
          { datetime: t(5), headline: `${company.name} announces product event`, source: "Test Wire", url: "https://example.com/2", related: symbol },
          { datetime: t(9), headline: `${company.name} wins praise from analysts`, source: "Test Wire", url: "https://example.com/3", related: symbol },
        ]);
      }
    }
    if (url.host === "api.tiingo.com") {
      const sym = url.pathname.split("/")[3].toUpperCase() as Sym;
      const company = COMPANIES[sym];
      const days = weekdays(url.searchParams.get("startDate")!, "2026-10-23");
      return json(
        days.map((date, i) => {
          const close = company.base + company.step * i + (i % 2 ? 0.8 : -0.8);
          return { date: `${date}T00:00:00.000Z`, adjOpen: close, adjHigh: close + 1, adjLow: close - 1, adjClose: close, adjVolume: 1e6 };
        }),
      );
    }
  });
}

type Script = (request: LlmRequest, callIndex: number) => Partial<LlmResponse>;

/** A scripted stand-in for Gemini that records every request it receives. */
export function fakeLlm(script: Script) {
  const requests: LlmRequest[] = [];
  const client: LlmClient = {
    async generate(request) {
      requests.push(request);
      const r = script(request, requests.length - 1);
      return {
        model: "fake-model",
        content: { role: "model", parts: [] },
        functionCalls: [],
        text: "",
        usage: { promptTokens: 10, outputTokens: 5, totalTokens: 15 },
        finishReason: "STOP",
        ...r,
      };
    },
  };
  return { client, requests };
}

export const call = (name: string, args: Record<string, unknown>) => ({ name, args });

/** Builds a schema-valid explanation that cites only real evidence ids. */
export function goodExplanation(tickers: string[]) {
  return JSON.stringify({
    stocks: tickers.map((ticker) => ({
      ticker,
      directionExplanation: "The direction comes from the moving averages and the 90-day return supplied by the app.",
      reasons: [
        { text: "The latest price sits relative to its 20-day average as shown.", evidence: ["M:PRICE", "M:SMA20"] },
        { text: "The 50-day average gives the longer trend context.", evidence: ["M:SMA50"] },
        { text: "The 90-day return summarises recent performance.", evidence: ["M:R90"] },
      ],
      risks: [
        { text: "Volatility means the price can swing quickly.", evidence: ["M:VOL"] },
        { text: "Headlines can change sentiment fast.", evidence: ["N:1"] },
      ],
      newsSummary: "Recent headlines were mostly positive by automated scoring.",
    })),
    comparison: tickers.length === 2 ? "Both stocks are described using the same supplied metrics only." : null,
  });
}
