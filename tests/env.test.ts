import { describe, expect, it } from "vitest";

import { ConfigError, parseEnv } from "@/lib/env";

const valid = {
  GEMINI_API_KEY: "test-gemini-key",
  GEMINI_MODEL: "gemini-2.5-flash",
  FINNHUB_API_KEY: "test-finnhub-key",
  TIINGO_API_KEY: "test-tiingo-key",
  UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
  UPSTASH_REDIS_REST_TOKEN: "test-token",
  SESSION_SECRET: "x".repeat(32),
  DEBUG_PASSWORD: "debug-password-123",
  DEMO_PASSWORD: "demo-password-456",
};

function problemsFor(source: Record<string, string | undefined>): string[] {
  try {
    parseEnv(source);
  } catch (error) {
    if (error instanceof ConfigError) return error.problems;
    throw error;
  }
  return [];
}

describe("parseEnv", () => {
  it("accepts a complete configuration and applies defaults", () => {
    const env = parseEnv(valid);
    expect(env.DEMO_MODE).toBe("password");
    expect(env.debugEnabled).toBe(true);
    expect(env.RATE_LIMIT_PER_MINUTE).toBe(10);
    expect(env.RATE_LIMIT_PER_DAY).toBe(50);
    expect(env.GLOBAL_DAILY_CAP).toBe(40);
    expect(env.GEMINI_FALLBACK_MODEL).toBeUndefined();
  });

  it("names missing variables", () => {
    const problems = problemsFor({ ...valid, GEMINI_API_KEY: undefined, TIINGO_API_KEY: "" });
    expect(problems.join(" ")).toContain("GEMINI_API_KEY");
    expect(problems.join(" ")).toContain("TIINGO_API_KEY");
  });

  it("never includes secret values in error messages", () => {
    const secret = "short-secret";
    const problems = problemsFor({ ...valid, SESSION_SECRET: secret });
    expect(problems.join(" ")).toContain("SESSION_SECRET");
    expect(problems.join(" ")).not.toContain(secret);
  });

  it("runs without any passwords: public chat, debug dashboard switched off", () => {
    const env = parseEnv({ ...valid, SESSION_SECRET: undefined, DEBUG_PASSWORD: undefined, DEMO_PASSWORD: undefined });
    expect(env.DEMO_MODE).toBe("public");
    expect(env.debugEnabled).toBe(false);
  });

  it("protects the chat whenever DEMO_PASSWORD is set, and enables debug only with its password", () => {
    expect(parseEnv(valid)).toMatchObject({ DEMO_MODE: "password", debugEnabled: true });
    expect(parseEnv({ ...valid, DEBUG_PASSWORD: undefined })).toMatchObject({ DEMO_MODE: "password", debugEnabled: false });
    expect(parseEnv({ ...valid, DEMO_MODE: "public" }).DEMO_MODE).toBe("public");
  });

  it("requires SESSION_SECRET when a password is set, and DEMO_PASSWORD in password mode", () => {
    expect(problemsFor({ ...valid, SESSION_SECRET: undefined }).join(" ")).toContain("SESSION_SECRET is required");
    expect(problemsFor({ ...valid, DEMO_MODE: "password", DEMO_PASSWORD: undefined }).join(" ")).toContain("DEMO_PASSWORD is required");
    expect(problemsFor({ ...valid, DEMO_PASSWORD: "short" }).join(" ")).toContain("DEMO_PASSWORD must be at least 12");
  });

  it("rejects a non-https Redis URL and non-numeric limits", () => {
    const problems = problemsFor({
      ...valid,
      UPSTASH_REDIS_REST_URL: "http://example.upstash.io",
      RATE_LIMIT_PER_DAY: "lots",
    });
    expect(problems.join(" ")).toContain("UPSTASH_REDIS_REST_URL");
    expect(problems.join(" ")).toContain("RATE_LIMIT_PER_DAY");
  });
});
