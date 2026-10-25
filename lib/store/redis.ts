import "server-only";
import { Redis } from "@upstash/redis";

import { getEnv } from "@/lib/env";

let client: Redis | undefined;

/** Shared Upstash client (HTTP based, so it works in serverless functions without pooling). */
export function getRedis(): Redis {
  const env = getEnv();
  client ??= new Redis({
    url: env.UPSTASH_REDIS_REST_URL,
    token: env.UPSTASH_REDIS_REST_TOKEN,
    // Fail fast: a slow cache must never eat the request's time budget.
    retry: { retries: 1, backoff: () => 100 },
    signal: () => AbortSignal.timeout(1_500),
  });
  return client;
}
