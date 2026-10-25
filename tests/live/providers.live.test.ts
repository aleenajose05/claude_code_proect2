import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * LIVE provider check: calls the real APIs once each for AAPL, using your own keys.
 * Skipped unless LIVE=1. Run on your computer with: npm run test:live
 * It prints only response shapes and pass/fail, never key values.
 */
const live = process.env.LIVE === "1";
if (live && existsSync(".env.local")) process.loadEnvFile(".env.local");

describe.skipIf(!live)("live providers (uses real API quota)", () => {
  it("resolves, quotes, fetches history and news for AAPL", { timeout: 60_000 }, async () => {
    const { createToolContext } = await import("@/lib/tools/context");
    const { resolveTicker } = await import("@/lib/tools/ticker");
    const { getQuote } = await import("@/lib/tools/quote");
    const { getPriceHistory } = await import("@/lib/tools/history");
    const { getNewsSentiment } = await import("@/lib/tools/news");
    const ctx = createToolContext();

    const resolved = await resolveTicker(ctx, { query: "Apple" });
    console.log("resolve_ticker:", resolved.status, resolved.status === "RESOLVED" ? `${resolved.ticker} · ${resolved.exchange}` : resolved.message);
    expect(resolved.status).toBe("RESOLVED");

    const quote = await getQuote(ctx, { ticker: "AAPL" });
    console.log("get_quote:", quote.provider, quote.freshness, quote.marketStatus, `quoteTime ${quote.quoteTime}`);

    const history = await getPriceHistory(ctx, { ticker: "AAPL" });
    console.log("get_price_history:", history.provider, `${history.candles.length} candles`, `adjusted=${history.adjusted}`);
    expect(history.candles.length).toBeGreaterThan(50);

    const news = await getNewsSentiment(ctx, { ticker: "AAPL" });
    console.log("get_news_sentiment:", news.provider, `${news.items.length} items`, `average=${news.averageSentiment}`);
  });

  it("gets a Gemini reply for the configured model", { timeout: 60_000 }, async () => {
    const { GeminiClient } = await import("@/lib/llm/gemini");
    const { getEnv } = await import("@/lib/env");
    const env = getEnv();
    const client = new GeminiClient(env.GEMINI_API_KEY, { primary: env.GEMINI_MODEL, fallback: env.GEMINI_FALLBACK_MODEL });
    const reply = await client.generate({
      system: "Reply with the single word OK.",
      contents: [{ role: "user", parts: [{ text: "ping" }] }],
      temperature: 0,
      maxOutputTokens: 64,
      signal: AbortSignal.timeout(30_000),
    });
    console.log("gemini:", reply.model, JSON.stringify(reply.text.slice(0, 20)), reply.usage);
    expect(reply.text.length).toBeGreaterThan(0);
  });
});
