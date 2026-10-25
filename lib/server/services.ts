import "server-only";

import { GeminiClient } from "@/lib/llm/gemini";
import { getEnv } from "@/lib/env";
import { providerGuard } from "@/lib/ratelimit";
import { redisCache } from "@/lib/store/cache";
import { getRedis } from "@/lib/store/redis";
import { createToolContext } from "@/lib/tools/context";

/** Builds the per-request dependencies for the chat orchestrator. */
export function createChatServices(signal: AbortSignal, onCacheError?: (operation: string) => void) {
  const env = getEnv();
  const redis = getRedis();
  return {
    redis,
    tools: createToolContext({ signal, guard: providerGuard(redis) }),
    llm: new GeminiClient(env.GEMINI_API_KEY, { primary: env.GEMINI_MODEL, fallback: env.GEMINI_FALLBACK_MODEL }),
    cache: redisCache(redis, onCacheError),
  };
}
