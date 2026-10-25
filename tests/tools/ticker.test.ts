import { afterEach, describe, expect, it, vi } from "vitest";

import { resolveTicker } from "@/lib/tools/ticker";
import { installFakeFetch, json, testContext } from "./fake-fetch";

type Listing = { symbol: string; description: string; type: string };

function fakeFinnhub(listings: Listing[], profiles: Record<string, object>) {
  return installFakeFetch((url) => {
    if (url.pathname === "/api/v1/search") {
      const q = url.searchParams.get("q")!.toLowerCase();
      const result = listings.filter((l) => l.symbol.toLowerCase() === q || l.description.toLowerCase().includes(q));
      return json({ count: result.length, result: result.map((l) => ({ ...l, displaySymbol: l.symbol })) });
    }
    if (url.pathname === "/api/v1/stock/profile2") {
      return json(profiles[url.searchParams.get("symbol")!] ?? {});
    }
  });
}

const LISTINGS: Listing[] = [
  { symbol: "AAPL", description: "APPLE INC", type: "Common Stock" },
  { symbol: "GOOGL", description: "ALPHABET INC-CL A", type: "Common Stock" },
  { symbol: "GOOG", description: "ALPHABET INC-CL C", type: "Common Stock" },
  { symbol: "SPY", description: "SPDR S&P 500 ETF TRUST", type: "ETP" },
  { symbol: "F", description: "FORD MOTOR CO", type: "Common Stock" },
  { symbol: "FORD", description: "FORWARD INDUSTRIES INC", type: "Common Stock" },
  { symbol: "ACU", description: "ACME UNITED CORP", type: "Common Stock" },
  { symbol: "ACMH", description: "ACME HOLDINGS INC", type: "Common Stock" },
  { symbol: "OLDCO", description: "OLD DELISTED CO", type: "Common Stock" },
];
const PROFILES = {
  AAPL: { name: "Apple Inc", ticker: "AAPL", exchange: "NASDAQ NMS - GLOBAL MARKET", country: "US", currency: "USD" },
  GOOGL: { name: "Alphabet Inc", ticker: "GOOGL", exchange: "NASDAQ NMS - GLOBAL MARKET", country: "US", currency: "USD" },
  GOOG: { name: "Alphabet Inc", ticker: "GOOG", exchange: "NASDAQ NMS - GLOBAL MARKET", country: "US", currency: "USD" },
  F: { name: "Ford Motor Co", ticker: "F", exchange: "NEW YORK STOCK EXCHANGE, INC.", country: "US", currency: "USD" },
};

const ctx = testContext("2026-10-26T14:00:00Z");
afterEach(() => vi.unstubAllGlobals());

describe("resolveTicker", () => {
  it("resolves a curated company name after verifying it", async () => {
    const fake = fakeFinnhub(LISTINGS, PROFILES);
    const r = await resolveTicker(ctx, { query: "Apple stock" });
    expect(r).toMatchObject({ status: "RESOLVED", ticker: "AAPL", companyName: "Apple Inc", notice: null });
    expect(fake.calls.map((c) => c.url.pathname).sort()).toEqual(["/api/v1/search", "/api/v1/stock/profile2"]);
    // The API key travels in a header, never in the URL.
    expect(fake.calls.every((c) => !c.url.search.includes("test-finnhub-key"))).toBe(true);
    expect(fake.calls[0].headers["X-Finnhub-Token"]).toBe("test-finnhub-key");
  });

  it("defaults Google to GOOGL with a notice, but respects GOOG and Class C", async () => {
    fakeFinnhub(LISTINGS, PROFILES);
    expect(await resolveTicker(ctx, { query: "Google" })).toMatchObject({ ticker: "GOOGL", notice: expect.stringContaining("GOOGL") });
    expect(await resolveTicker(ctx, { query: "GOOG" })).toMatchObject({ ticker: "GOOG", notice: null });
    expect(await resolveTicker(ctx, { query: "Alphabet class C" })).toMatchObject({ ticker: "GOOG", notice: null });
  });

  it("matches company names rather than look-alike tickers", async () => {
    fakeFinnhub(LISTINGS, PROFILES);
    expect(await resolveTicker(ctx, { query: "ford" })).toMatchObject({ status: "RESOLVED", ticker: "F" });
  });

  it("rejects non-common-stock instruments", async () => {
    fakeFinnhub(LISTINGS, PROFILES);
    const r = await resolveTicker(ctx, { query: "SPY" });
    expect(r.status).toBe("UNSUPPORTED_INSTRUMENT");
    expect(r.status !== "RESOLVED" && r.message).toContain("ETP");
  });

  it("asks for clarification when several companies match", async () => {
    fakeFinnhub(LISTINGS, PROFILES);
    const r = await resolveTicker(ctx, { query: "Acme" });
    expect(r.status).toBe("AMBIGUOUS");
    expect(r.status !== "RESOLVED" && r.candidates.map((c) => c.ticker)).toEqual(["ACU", "ACMH"]);
  });

  it("reports delisted and unknown symbols", async () => {
    fakeFinnhub(LISTINGS, PROFILES);
    expect((await resolveTicker(ctx, { query: "OLDCO" })).status).toBe("NOT_LISTED");
    expect((await resolveTicker(ctx, { query: "ZZZZQ" })).status).toBe("NOT_FOUND");
    expect((await resolveTicker(ctx, { query: "qwertyuiop" })).status).toBe("NOT_FOUND");
  });

  it("validates its input", async () => {
    await expect(resolveTicker(ctx, { query: "" })).rejects.toThrow();
    await expect(resolveTicker(ctx, { query: "AAPL", extra: 1 })).rejects.toThrow();
  });
});
