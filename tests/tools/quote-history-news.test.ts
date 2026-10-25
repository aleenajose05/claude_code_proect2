import { afterEach, describe, expect, it, vi } from "vitest";

import { AppError } from "@/lib/errors";
import { getPriceHistory } from "@/lib/tools/history";
import { getNewsSentiment } from "@/lib/tools/news";
import { getQuote } from "@/lib/tools/quote";
import { installFakeFetch, json, testContext } from "./fake-fetch";

afterEach(() => vi.unstubAllGlobals());

// Monday 2026-10-26, 10:00 ET — market open. All bodies are TEST-ONLY fixtures.
const OPEN_NOW = "2026-10-26T14:00:00Z";
const FINNHUB_QUOTE = { c: 101.5, d: 1.5, dp: 1.5, h: 102, l: 99.5, o: 100, pc: 100, t: Date.parse("2026-10-26T13:58:00Z") / 1000 };
const AV_QUOTE = {
  "Global Quote": {
    "01. symbol": "TEST",
    "05. price": "101.0000",
    "07. latest trading day": "2026-10-26",
    "08. previous close": "100.0000",
    "09. change": "1.0000",
    "10. change percent": "1.0000%",
  },
};

async function codeOf(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error instanceof AppError ? error.code : String(error);
  }
  return "RESOLVED";
}

describe("getQuote", () => {
  it("returns a validated Finnhub quote labelled by its timestamp", async () => {
    installFakeFetch((url) => (url.host === "finnhub.io" ? json(FINNHUB_QUOTE) : undefined));
    const q = await getQuote(testContext(OPEN_NOW), { ticker: "test" });
    expect(q).toMatchObject({
      ticker: "TEST",
      price: 101.5,
      change: 1.5,
      changePercent: 1.5,
      marketStatus: "OPEN",
      provider: "Finnhub",
      freshness: "INTRADAY",
      quoteAgeSessions: 0,
      usedFallback: false,
      fetchedAt: "2026-10-26T14:00:00.000Z",
    });
  });

  it("treats Finnhub's all-zero answer as unavailable without using the fallback", async () => {
    const fake = installFakeFetch((url) => (url.host === "finnhub.io" ? json({ c: 0, d: null, dp: null, h: 0, l: 0, o: 0, pc: 0, t: 0 }) : undefined));
    expect(await codeOf(getQuote(testContext(OPEN_NOW), { ticker: "ZZZZ" }))).toBe("DATA_UNAVAILABLE");
    expect(fake.calls).toHaveLength(1);
  });

  it("falls back to Alpha Vantage when Finnhub is rate-limited, and never labels it intraday", async () => {
    installFakeFetch((url) => (url.host === "finnhub.io" ? json({ error: "limit" }, 429) : json(AV_QUOTE)));
    const q = await getQuote(testContext(OPEN_NOW), { ticker: "TEST" });
    expect(q).toMatchObject({ provider: "Alpha Vantage", usedFallback: true, quoteTimeIsDateOnly: true, freshness: "DELAYED", price: 101 });
  });

  it("reports provider errors as typed, key-free errors", async () => {
    installFakeFetch((url) => (url.host === "finnhub.io" ? json({}, 429) : json({ Note: "Thank you for using Alpha Vantage!" })));
    const promise = getQuote(testContext(OPEN_NOW), { ticker: "TEST" });
    await expect(promise).rejects.toMatchObject({ code: "PROVIDER_QUOTA" });
    await promise.catch((error: Error) => expect(error.message).not.toContain("test-av-key"));

    installFakeFetch(() => json({}, 429));
    expect(await codeOf(getQuote(testContext(OPEN_NOW, { alphaVantage: false }), { ticker: "TEST" }))).toBe("PROVIDER_QUOTA");

    installFakeFetch(() => Promise.reject(new DOMException("timed out", "TimeoutError")));
    expect(await codeOf(getQuote(testContext(OPEN_NOW, { alphaVantage: false }), { ticker: "TEST" }))).toBe("PROVIDER_TIMEOUT");

    installFakeFetch(() => new Response("<html>oops</html>", { status: 200 }));
    expect(await codeOf(getQuote(testContext(OPEN_NOW, { alphaVantage: false }), { ticker: "TEST" }))).toBe("INVALID_PROVIDER_RESPONSE");
  });

  it("rejects malformed tickers before any request", async () => {
    const fake = installFakeFetch(() => json(FINNHUB_QUOTE));
    await expect(getQuote(testContext(OPEN_NOW), { ticker: "AAPL; DROP" })).rejects.toThrow();
    expect(fake.calls).toHaveLength(0);
  });
});

const tiingoRow = (date: string, close: number) => ({
  date: `${date}T00:00:00.000Z`,
  close: close * 2, // unadjusted values differ on purpose; only adj* fields may be used
  adjOpen: close,
  adjHigh: close + 1,
  adjLow: close - 1,
  adjClose: close,
  adjVolume: 1000,
});

describe("getPriceHistory", () => {
  it("uses adjusted Tiingo prices for the last 90 calendar days", async () => {
    const fake = installFakeFetch((url) =>
      url.host === "api.tiingo.com" ? json([tiingoRow("2026-07-27", 100), tiingoRow("2026-07-28", 101), tiingoRow("2026-10-23", 110)]) : undefined,
    );
    const h = await getPriceHistory(testContext(OPEN_NOW), { ticker: "TEST" });
    expect(h).toMatchObject({ from: "2026-07-28", to: "2026-10-26", adjusted: true, provider: "Tiingo", usedFallback: false });
    expect(h.candles.map((c) => [c.date, c.close])).toEqual([["2026-07-28", 101], ["2026-10-23", 110]]);
    expect(fake.calls[0].url.searchParams.get("startDate")).toBe("2026-07-28");
    expect(fake.calls[0].headers.Authorization).toBe("Token test-tiingo-key");
  });

  it("reports unknown tickers and falls back to unadjusted Alpha Vantage on provider failure", async () => {
    installFakeFetch(() => json({ detail: "not found" }, 404));
    expect(await codeOf(getPriceHistory(testContext(OPEN_NOW), { ticker: "ZZZZ" }))).toBe("DATA_UNAVAILABLE");

    installFakeFetch((url) =>
      url.host === "api.tiingo.com"
        ? json({}, 500)
        : json({
            "Time Series (Daily)": {
              "2026-10-23": { "1. open": "100", "2. high": "101", "3. low": "99", "4. close": "100.5", "5. volume": "10" },
              "2026-06-01": { "1. open": "90", "2. high": "91", "3. low": "89", "4. close": "90.5", "5. volume": "10" },
            },
          }),
    );
    const h = await getPriceHistory(testContext(OPEN_NOW), { ticker: "TEST" });
    expect(h).toMatchObject({ adjusted: false, provider: "Alpha Vantage", usedFallback: true });
    expect(h.candles.map((c) => c.date)).toEqual(["2026-10-23"]);
  });
});

describe("getNewsSentiment", () => {
  const unix = (iso: string) => Date.parse(iso) / 1000;

  it("cleans, de-duplicates and scores recent company news", async () => {
    const fake = installFakeFetch(() =>
      json([
        { datetime: unix("2026-10-26T12:00:00Z"), headline: "TestCo shares surge after strong results", source: "Wire A", url: "https://example.com/a", related: "TEST", summary: "" },
        { datetime: unix("2026-10-26T11:00:00Z"), headline: "TestCo shares surge after strong results", source: "Wire B", url: "https://example.com/b", related: "TEST" },
        { datetime: unix("2026-10-25T12:00:00Z"), headline: "Other company news", source: "Wire C", url: "https://example.com/c", related: "OTHER" },
        { datetime: unix("2026-10-25T10:00:00Z"), headline: "Bad link", source: "Wire D", url: "javascript:alert(1)", related: "TEST" },
        { datetime: unix("2026-10-24T12:00:00Z"), headline: "TestCo faces\u0007 lawsuit over weak sales", source: "Wire E", url: "https://example.com/e", related: "TEST" },
        { datetime: unix("2026-10-23T12:00:00Z"), headline: "TestCo schedules annual meeting", source: "Wire F", url: "https://example.com/f", related: "TEST" },
      ]),
    );
    const n = await getNewsSentiment(testContext(OPEN_NOW), { ticker: "TEST" });
    expect(fake.calls[0].url.searchParams.get("from")).toBe("2026-10-19");
    expect(n.items.map((i) => i.headline)).toEqual([
      "TestCo shares surge after strong results",
      "TestCo faces lawsuit over weak sales",
      "TestCo schedules annual meeting",
    ]);
    expect(n.items.map((i) => i.id)).toEqual(["news-1", "news-2", "news-3"]);
    expect(n.items[0].sentimentLabel).toBe("POSITIVE");
    expect(n.items[1].sentimentLabel).toBe("NEGATIVE");
    expect(n.averageSentiment).not.toBeNull();
    expect(n.sentimentSource).toContain("VADER");
  });

  it("returns an empty list with no average when there is no news", async () => {
    installFakeFetch(() => json([]));
    const n = await getNewsSentiment(testContext(OPEN_NOW), { ticker: "TEST" });
    expect(n.items).toEqual([]);
    expect(n.averageSentiment).toBeNull();
  });
});
