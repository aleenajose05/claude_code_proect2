import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { clientId } from "@/lib/auth";
import { runChat } from "@/lib/chat/orchestrator";
import { Trace } from "@/lib/chat/trace";
import { chatRequestSchema, type ChatResult, type ChatStreamEvent } from "@/lib/chat/types";
import { clientIdSalt, ConfigError, getEnv } from "@/lib/env";
import { checkChatLimits } from "@/lib/ratelimit";
import { writeRequestLog, type RequestLog } from "@/lib/store/logger";
import { redactPreview, sanitizeError } from "@/lib/store/redact";
import { createChatServices } from "@/lib/server/services";
import { hasSession, jsonError } from "@/lib/server/session";

// Vercel Hobby allows up to 300 s with Fluid compute; the app budgets far less.
export const maxDuration = 60;

const REQUEST_BUDGET_MS = 45_000;
const MAX_BODY_BYTES = 4_096;

export async function POST(request: NextRequest) {
  const requestId = `req_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const trace = new Trace();
  trace.mark("Question received");

  let env;
  try {
    env = getEnv();
  } catch (error) {
    if (error instanceof ConfigError) return jsonError(503, "CONFIG_ERROR", `Server configuration is incomplete: ${error.problems.join("; ")}`);
    throw error;
  }
  if (!hasSession(request, "demo")) return jsonError(401, "UNAUTHORIZED", "Please log in to use StockLens AI.");

  const raw = await request.text();
  if (Buffer.byteLength(raw) > MAX_BODY_BYTES) return jsonError(413, "TOO_LARGE", "The request is too large.");
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return jsonError(400, "INVALID_JSON", "The request body must be JSON.");
  }
  const parsed = chatRequestSchema.safeParse(body);
  if (!parsed.success) return jsonError(400, "INVALID_REQUEST", parsed.error.issues[0]?.message ?? "Invalid request.");

  const abort = new AbortController();
  request.signal.addEventListener("abort", () => abort.abort());
  const services = createChatServices(abort.signal, (op) => trace.mark(`Cache ${op} failed; continuing without cache`, undefined, "error"));

  const limits = await checkChatLimits(services.redis, clientId(request.headers, clientIdSalt(env)));
  trace.mark("Rate limit checked");
  if (!limits.ok) {
    await safeLog(services.redis, baseLog(requestId, parsed.data.question, trace, 429, "rate_limited", limits.message));
    return jsonError(429, "RATE_LIMITED", limits.message, { "Retry-After": String(limits.retryAfterSeconds) });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const send = (event: ChatStreamEvent) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          open = false; // the browser went away; finish the work and log it anyway
        }
      };
      for (const step of trace.steps) send({ type: "step", step });
      trace.onStep = (step) => send({ type: "step", step });
      let result: ChatResult;
      try {
        result = await runChat(parsed.data, {
          ...services,
          trace,
          deadline: Date.now() + REQUEST_BUDGET_MS,
        });
      } catch (error) {
        result = { kind: "error", code: "INTERNAL_ERROR", message: "Something went wrong while preparing the analysis.", context: parsed.data.context };
        trace.mark("Unexpected server error", sanitizeError(error instanceof Error ? error.message : String(error)), "error");
      }
      send({ type: "result", requestId, result });
      trace.onStep = undefined;
      if (open) controller.close();
      await safeLog(services.redis, {
        ...baseLog(requestId, parsed.data.question, trace, 200, result.kind, result.kind === "error" ? result.message : null),
        tickers: result.kind === "analysis" ? result.stocks.map((s) => s.company.ticker) : [],
      });
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Request-Id": requestId },
  });
}

function baseLog(requestId: string, question: string, trace: Trace, httpStatus: number, resultKind: string, error: string | null): RequestLog {
  const failed = httpStatus >= 400 || resultKind === "error";
  return {
    requestId,
    timestamp: new Date(trace.startedAt).toISOString(),
    tickers: [],
    questionPreview: redactPreview(question),
    model: trace.model,
    tokens: trace.tokens.total ? { ...trace.tokens } : null,
    durationMs: trace.elapsedMs(),
    toolDurations: { ...trace.toolDurations },
    cache: { ...trace.cache },
    httpStatus,
    validation: trace.validation,
    resultKind,
    error: error ? sanitizeError(error) : null,
    status: failed ? "FAILED" : "SUCCESS",
    steps: trace.steps.map((s) => ({ ...s, detail: s.detail ? sanitizeError(s.detail) : undefined })),
  };
}

async function safeLog(redis: Parameters<typeof writeRequestLog>[0], log: RequestLog) {
  try {
    await writeRequestLog(redis, log);
  } catch {
    // Logging must never break a response; the dashboard shows Redis health separately.
  }
}
