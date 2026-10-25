import { afterEach, describe, expect, it, vi } from "vitest";

import { checkChatLimits, checkLoginLimit, providerGuard } from "@/lib/ratelimit";
import { fakeRedis } from "../store/fake-redis";

const ENV = {
  GEMINI_API_KEY: "k", GEMINI_MODEL: "m", FINNHUB_API_KEY: "k", TIINGO_API_KEY: "k",
  UPSTASH_REDIS_REST_URL: "https://example.upstash.io", UPSTASH_REDIS_REST_TOKEN: "t",
  SESSION_SECRET: "s".repeat(40), DEBUG_PASSWORD: "debug-password-1", DEMO_PASSWORD: "demo-password-2",
};

afterEach(() => vi.unstubAllEnvs());

describe("rate limits when Redis is unreachable", () => {
  it("degrade to allowing requests instead of breaking the app", async () => {
    for (const [k, v] of Object.entries(ENV)) vi.stubEnv(k, v);
    const redis = fakeRedis({ failing: true });
    expect(await checkChatLimits(redis, "client")).toEqual({ ok: true });
    expect(await checkLoginLimit(redis, "debug", "client")).toEqual({ ok: true });
    await expect(providerGuard(redis)("Finnhub")).resolves.toBeUndefined();
  });
});
