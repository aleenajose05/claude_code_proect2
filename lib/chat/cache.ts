import type { CacheStatus } from "@/lib/analysis/build";

/** Cache abstraction used by the orchestrator; the Redis implementation lives in lib/store/cache.ts. */
export interface DataCache {
  wrap<T>(key: string, ttlSeconds: number, load: () => Promise<T>): Promise<{ value: T; cache: CacheStatus }>;
}

/** Used when Redis is unavailable: always loads fresh data and reports BYPASS. */
export const noCache: DataCache = {
  async wrap(_key, _ttl, load) {
    return { value: await load(), cache: "BYPASS" };
  },
};

export const CACHE_TTL_SECONDS = {
  ticker: 24 * 60 * 60,
  quote: 60,
  history: 12 * 60 * 60,
  news: 15 * 60,
} as const;
