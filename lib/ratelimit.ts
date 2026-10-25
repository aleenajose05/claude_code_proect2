import "server-only";
import { Ratelimit } from "@upstash/ratelimit";
import type { Redis } from "@upstash/redis";

import { getEnv } from "@/lib/env";
import { AppError } from "@/lib/errors";
import type { ProviderGuard } from "@/lib/providers/http";

/**
 * Per-user, global and per-provider limits. Upstash Ratelimit fails open on Redis timeouts
 * (reason "timeout"), so a cache outage never blocks the app; providers still enforce
 * their own limits and return 429, which the app reports.
 */

type Window = Parameters<typeof Ratelimit.slidingWindow>[1];

const limiters = new Map<string, Ratelimit>();

function limiter(redis: Redis, name: string, tokens: number, window: Window, fixed = false) {
  const key = `${name}:${tokens}:${window}`;
  let rl = limiters.get(key);
  if (!rl) {
    rl = new Ratelimit({
      redis,
      prefix: `rl:${name}:${String(window).replace(/\s+/g, "")}`,
      limiter: fixed ? Ratelimit.fixedWindow(tokens, window) : Ratelimit.slidingWindow(tokens, window),
      timeout: 1_000,
      analytics: false,
    });
    limiters.set(key, rl);
  }
  return rl;
}

/**
 * Network errors (not just timeouts) are treated as "allowed" so a Redis outage degrades
 * protection instead of taking the whole app down. The outage shows on the debug dashboard.
 */
async function limitSafely(rl: Ratelimit, id: string): Promise<{ success: boolean; reset: number }> {
  try {
    const r = await rl.limit(id);
    return { success: r.success, reset: r.reset };
  } catch {
    return { success: true, reset: Date.now() };
  }
}

export type LimitDecision = { ok: true } | { ok: false; message: string; retryAfterSeconds: number };

const retryAfter = (reset: number) => Math.max(1, Math.ceil((reset - Date.now()) / 1000));

export async function checkChatLimits(redis: Redis, clientId: string): Promise<LimitDecision> {
  const env = getEnv();
  const minute = await limitSafely(limiter(redis, "user-min", env.RATE_LIMIT_PER_MINUTE, "1 m"), clientId);
  if (!minute.success) return { ok: false, message: `You can ask up to ${env.RATE_LIMIT_PER_MINUTE} questions per minute. Please wait a moment.`, retryAfterSeconds: retryAfter(minute.reset) };
  const day = await limitSafely(limiter(redis, "user-day", env.RATE_LIMIT_PER_DAY, "1 d"), clientId);
  if (!day.success) return { ok: false, message: `The daily limit of ${env.RATE_LIMIT_PER_DAY} questions has been reached.`, retryAfterSeconds: retryAfter(day.reset) };
  const global = await limitSafely(limiter(redis, "global-day", env.GLOBAL_DAILY_CAP, "1 d", true), "global");
  if (!global.success) return { ok: false, message: "The demo's daily usage cap has been reached to protect free-tier quotas. Please try again tomorrow.", retryAfterSeconds: retryAfter(global.reset) };
  return { ok: true };
}

/** Login attempts: 5 per 15 minutes per client and auth scope. */
export async function checkLoginLimit(redis: Redis, scope: "demo" | "debug", clientId: string): Promise<LimitDecision> {
  const r = await limitSafely(limiter(redis, `login-${scope}`, 5, "15 m"), clientId);
  return r.success ? { ok: true } : { ok: false, message: "Too many login attempts. Please wait 15 minutes.", retryAfterSeconds: retryAfter(r.reset) };
}

/** The app's own budget per provider, kept below each free plan's published limit. */
const PROVIDER_BUDGETS: Record<string, [number, Window][]> = {
  Finnhub: [[50, "1 m"]],
  Tiingo: [[45, "1 h"], [900, "1 d"]],
  "Alpha Vantage": [[5, "1 m"], [20, "1 d"]],
};

export function providerGuard(redis: Redis): ProviderGuard {
  return async (provider) => {
    for (const [tokens, window] of PROVIDER_BUDGETS[provider] ?? []) {
      const r = await limitSafely(limiter(redis, `provider-${provider.replace(/\s+/g, "-").toLowerCase()}`, tokens, window, true), "app");
      if (!r.success) {
        throw new AppError("PROVIDER_QUOTA", `The app's ${provider} budget (${tokens} per ${window}) is used up for now`, { provider });
      }
    }
  };
}
