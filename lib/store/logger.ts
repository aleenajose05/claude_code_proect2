import "server-only";
import type { Redis } from "@upstash/redis";

import type { TraceStep } from "@/lib/chat/trace";

/** Redacted request log: only the latest 20 records are kept (LPUSH + LTRIM in one transaction). */

export const LOG_KEY = "logs:requests:v1";
export const MAX_LOGS = 20;
export const STATS_KEY = "stats:requests:v1";

export interface RequestLog {
  requestId: string;
  timestamp: string;
  tickers: string[];
  /** Redacted, ≤100 characters, or null when it could not be safely redacted. */
  questionPreview: string | null;
  model: string | null;
  tokens: { prompt: number; output: number; total: number } | null;
  durationMs: number;
  toolDurations: Record<string, number>;
  cache: { hits: number; misses: number };
  httpStatus: number;
  validation: string;
  resultKind: string;
  error: string | null;
  status: "SUCCESS" | "FAILED";
  steps: TraceStep[];
}

export async function writeRequestLog(redis: Redis, log: RequestLog): Promise<void> {
  const tx = redis.multi();
  tx.lpush(LOG_KEY, JSON.stringify(log));
  tx.ltrim(LOG_KEY, 0, MAX_LOGS - 1);
  tx.hincrby(STATS_KEY, "total", 1);
  tx.hincrby(STATS_KEY, log.status === "SUCCESS" ? "success" : "failed", 1);
  await tx.exec();
}

export async function readRequestLogs(redis: Redis): Promise<{ logs: RequestLog[]; lifetime: Record<string, number> }> {
  const [rows, stats] = await Promise.all([
    redis.lrange<RequestLog | string>(LOG_KEY, 0, MAX_LOGS - 1),
    redis.hgetall<Record<string, number | string>>(STATS_KEY),
  ]);
  const logs = rows.flatMap((row) => {
    try {
      return [typeof row === "string" ? (JSON.parse(row) as RequestLog) : row];
    } catch {
      return [];
    }
  });
  const lifetime = Object.fromEntries(Object.entries(stats ?? {}).map(([k, v]) => [k, Number(v)]));
  return { logs, lifetime };
}
