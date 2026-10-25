import "server-only";
import type { Redis } from "@upstash/redis";

import type { DataCache } from "@/lib/chat/cache";

/**
 * Redis-backed cache. Cached tool results keep their original provider timestamps and
 * fetchedAt, and are reported as HIT, so cached data is never presented as newly fetched.
 * Any Redis failure degrades to loading fresh data (BYPASS) rather than failing the request.
 */

const PREFIX = "cache:v1:";

interface Envelope<T> {
  value: T;
  cachedAt: string;
}

export function redisCache(redis: Redis, onError?: (operation: string) => void): DataCache {
  return {
    async wrap(key, ttlSeconds, load) {
      let redisUp = true;
      try {
        const hit = await redis.get<Envelope<Awaited<ReturnType<typeof load>>>>(PREFIX + key);
        if (hit && typeof hit === "object" && "value" in hit) return { value: hit.value, cache: "HIT" };
      } catch {
        redisUp = false;
        onError?.("get");
      }
      const value = await load();
      if (redisUp) {
        try {
          await redis.set(PREFIX + key, { value, cachedAt: new Date().toISOString() }, { ex: ttlSeconds });
        } catch {
          redisUp = false;
          onError?.("set");
        }
      }
      return { value, cache: redisUp ? "MISS" : "BYPASS" };
    },
  };
}
