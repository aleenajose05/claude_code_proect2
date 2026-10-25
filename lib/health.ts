import "server-only";
import { GoogleGenAI } from "@google/genai";
import type { Redis } from "@upstash/redis";

import { getEnv } from "@/lib/env";
import { GEMINI_HTTP_OPTIONS } from "@/lib/llm/gemini";
import { sanitizeError } from "@/lib/store/redact";

/**
 * Lightweight, real health checks. Results are cached in Redis for 60 seconds so an open
 * dashboard cannot burn free-tier quotas. An HTTP 200 carrying a provider-level error is
 * DEGRADED or UNAVAILABLE, never HEALTHY.
 */

export type HealthStatus = "HEALTHY" | "DEGRADED" | "UNAVAILABLE";

export interface ServiceHealth {
  service: string;
  status: HealthStatus;
  latencyMs: number | null;
  checkedAt: string;
  lastSuccessAt: string | null;
  lastError: string | null;
  /** Only when the provider reports it in response headers. */
  remainingQuota: string | null;
}

const CACHE_KEY = "health:v1:latest";
const LAST_OK_KEY = "health:v1:last-ok";
const CACHE_SECONDS = 60;
const SLOW_MS = 2_500;
const TIMEOUT_MS = 5_000;

type Probe = () => Promise<{ ok: boolean; problem?: string; remainingQuota?: string | null }>;

async function timed(service: string, probe: Probe): Promise<Omit<ServiceHealth, "lastSuccessAt">> {
  const start = Date.now();
  const checkedAt = new Date().toISOString();
  try {
    const result = await probe();
    const latencyMs = Date.now() - start;
    const status: HealthStatus = !result.ok ? "DEGRADED" : latencyMs > SLOW_MS ? "DEGRADED" : "HEALTHY";
    return { service, status, latencyMs, checkedAt, lastError: result.problem ? sanitizeError(result.problem) : null, remainingQuota: result.remainingQuota ?? null };
  } catch (error) {
    const message = error instanceof Error && error.name === "TimeoutError" ? "timed out" : error instanceof Error ? error.message : "request failed";
    return { service, status: "UNAVAILABLE", latencyMs: Date.now() - start, checkedAt, lastError: sanitizeError(message), remainingQuota: null };
  }
}

async function getJson(url: string, headers: Record<string, string>) {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
  const body: unknown = await response.json().catch(() => null);
  return { response, body };
}

function quotaHeader(response: Response): string | null {
  const remaining = response.headers.get("x-ratelimit-remaining");
  const limit = response.headers.get("x-ratelimit-limit");
  return remaining ? `${remaining}${limit ? ` of ${limit}` : ""} remaining` : null;
}

export async function runHealthChecks(redis: Redis, options: { force?: boolean } = {}): Promise<{ services: ServiceHealth[]; cached: boolean }> {
  if (!options.force) {
    try {
      const cached = await redis.get<ServiceHealth[]>(CACHE_KEY);
      if (cached) return { services: cached, cached: true };
    } catch {
      // Redis is checked below as a service; a cache miss just means checking now.
    }
  }

  const env = getEnv();
  const finnhubHeaders = { "X-Finnhub-Token": env.FINNHUB_API_KEY };
  const today = new Date().toISOString().slice(0, 10);

  const results = await Promise.all([
    timed("Gemini", async () => {
      const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY, httpOptions: GEMINI_HTTP_OPTIONS });
      // Model metadata lookup: verifies the key and model ID without spending generation tokens.
      const model = await ai.models.get({ model: env.GEMINI_MODEL, config: { abortSignal: AbortSignal.timeout(TIMEOUT_MS) } });
      return model.name ? { ok: true } : { ok: false, problem: "model metadata missing" };
    }),
    timed("Quote provider (Finnhub)", async () => {
      const { response, body } = await getJson("https://finnhub.io/api/v1/quote?symbol=AAPL", finnhubHeaders);
      const price = (body as { c?: unknown } | null)?.c;
      if (!response.ok) return { ok: false, problem: `HTTP ${response.status}`, remainingQuota: quotaHeader(response) };
      return typeof price === "number" && price > 0 ? { ok: true, remainingQuota: quotaHeader(response) } : { ok: false, problem: "quote response contained no price" };
    }),
    timed("History provider (Tiingo)", async () => {
      const { response, body } = await getJson("https://api.tiingo.com/tiingo/daily/AAPL", { Authorization: `Token ${env.TIINGO_API_KEY}` });
      if (!response.ok) return { ok: false, problem: `HTTP ${response.status}` };
      return (body as { ticker?: unknown } | null)?.ticker ? { ok: true } : { ok: false, problem: "metadata response had no ticker" };
    }),
    timed("News provider (Finnhub)", async () => {
      const { response, body } = await getJson(`https://finnhub.io/api/v1/company-news?symbol=AAPL&from=${today}&to=${today}`, finnhubHeaders);
      if (!response.ok) return { ok: false, problem: `HTTP ${response.status}`, remainingQuota: quotaHeader(response) };
      return Array.isArray(body) ? { ok: true, remainingQuota: quotaHeader(response) } : { ok: false, problem: "news response was not a list" };
    }),
    timed("Upstash Redis", async () => {
      const pong = await redis.ping();
      return pong === "PONG" ? { ok: true } : { ok: false, problem: "unexpected PING reply" };
    }),
  ]);

  let lastOk: Record<string, string> = {};
  try {
    const healthyNow = Object.fromEntries(results.filter((r) => r.status === "HEALTHY").map((r) => [r.service, r.checkedAt]));
    if (Object.keys(healthyNow).length) await redis.hset(LAST_OK_KEY, healthyNow);
    lastOk = (await redis.hgetall<Record<string, string>>(LAST_OK_KEY)) ?? {};
  } catch {
    lastOk = {};
  }
  const services = results.map((r) => ({ ...r, lastSuccessAt: lastOk[r.service] ?? (r.status === "HEALTHY" ? r.checkedAt : null) }));
  try {
    await redis.set(CACHE_KEY, services, { ex: CACHE_SECONDS });
  } catch {
    // Not cached: the next refresh simply checks again.
  }
  return { services, cached: false };
}
