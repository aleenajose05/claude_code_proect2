import { describe, expect, it, vi } from "vitest";

import { redisCache } from "@/lib/store/cache";
import { MAX_LOGS, readRequestLogs, writeRequestLog, type RequestLog } from "@/lib/store/logger";
import { fakeRedis } from "./fake-redis";

describe("redisCache", () => {
  it("reports MISS then HIT and keeps the original value (including its fetch time)", async () => {
    const redis = fakeRedis();
    const cache = redisCache(redis);
    const load = vi.fn(async () => ({ price: 1, fetchedAt: "2026-10-26T14:00:00.000Z" }));
    expect(await cache.wrap("quote:TEST", 60, load)).toEqual({ value: { price: 1, fetchedAt: "2026-10-26T14:00:00.000Z" }, cache: "MISS" });
    expect(await cache.wrap("quote:TEST", 60, load)).toEqual({ value: { price: 1, fetchedAt: "2026-10-26T14:00:00.000Z" }, cache: "HIT" });
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("falls back to fresh data (BYPASS) when Redis is down", async () => {
    const onError = vi.fn();
    const cache = redisCache(fakeRedis({ failing: true }), onError);
    expect(await cache.wrap("quote:TEST", 60, async () => 42)).toEqual({ value: 42, cache: "BYPASS" });
    expect(onError).toHaveBeenCalledWith("get");
  });

  it("does not cache failures", async () => {
    const cache = redisCache(fakeRedis());
    await expect(cache.wrap("k", 60, async () => Promise.reject(new Error("provider down")))).rejects.toThrow();
    expect(await cache.wrap("k", 60, async () => "ok")).toEqual({ value: "ok", cache: "MISS" });
  });
});

describe("request log", () => {
  const log = (n: number): RequestLog => ({
    requestId: `req_${n}`, timestamp: new Date(n * 1000).toISOString(), tickers: [], questionPreview: null, model: null, tokens: null,
    durationMs: n, toolDurations: {}, cache: { hits: 0, misses: 0 }, httpStatus: 200, validation: "NOT_RUN", resultKind: "analysis",
    error: null, status: n % 5 === 0 ? "FAILED" : "SUCCESS", steps: [],
  });

  it("keeps only the latest 20 records, newest first, plus lifetime counters", async () => {
    const redis = fakeRedis();
    for (let n = 1; n <= 25; n++) await writeRequestLog(redis, log(n));
    const { logs, lifetime } = await readRequestLogs(redis);
    expect(logs).toHaveLength(MAX_LOGS);
    expect(logs[0].requestId).toBe("req_25");
    expect(logs.at(-1)!.requestId).toBe("req_6");
    expect(lifetime).toEqual({ total: 25, success: 20, failed: 5 });
  });
});
