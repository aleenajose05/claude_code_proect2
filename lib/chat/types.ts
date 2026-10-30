import { z } from "zod";

import type { CacheStatus, StockAnalysis } from "@/lib/analysis/build";
import type { Intent } from "./intent";
import type { TraceStep } from "./trace";
import type { Explanation } from "@/lib/llm/schema";
import { tickerSchema } from "@/lib/tools/schemas";

export const MAX_QUESTION_LENGTH = 500;
export const MAX_TICKERS_PER_REQUEST = 2;

export const DISCLAIMER =
  "Not financial advice. Stock market investments involve risk. Market data may be delayed. Forecast ranges are estimates based on historical information and do not guarantee future performance.";

/** The only conversation memory the browser sends: ticker references, never prices. */
export const conversationContextSchema = z
  .object({
    activeTicker: tickerSchema.nullable().default(null),
    secondaryTicker: tickerSchema.nullable().default(null),
  })
  .strict();
export type ConversationContext = z.infer<typeof conversationContextSchema>;

export const chatRequestSchema = z
  .object({
    question: z.string().trim().min(1, "Please type a question.").max(MAX_QUESTION_LENGTH, `Questions are limited to ${MAX_QUESTION_LENGTH} characters.`),
    context: conversationContextSchema.default({ activeTicker: null, secondaryTicker: null }),
  })
  .strict();
export type ChatRequest = z.infer<typeof chatRequestSchema>;

export interface Candidate {
  ticker: string;
  name: string;
  type: string;
}

export type ChatResult =
  | {
      kind: "analysis";
      stocks: StockAnalysis[];
      explanation: Explanation;
      /** "AI" when Gemini's explanation passed validation, otherwise the deterministic template. */
      explanationSource: "AI" | "FALLBACK";
      /** What was asked and how much detail to show (brief / why / detailed). */
      intent: Intent;
      notices: string[];
      context: ConversationContext;
      disclaimer: string;
    }
  | { kind: "clarification"; message: string; candidates: Candidate[]; context: ConversationContext }
  | { kind: "out_of_scope"; message: string; context: ConversationContext }
  | { kind: "error"; code: string; message: string; context: ConversationContext };

export interface CacheReport {
  key: string;
  status: CacheStatus;
}

/** NDJSON stream from /api/chat: progress steps as they really happen, then exactly one result line. */
export type ChatStreamEvent =
  | { type: "step"; step: TraceStep }
  | { type: "result"; requestId: string; result: ChatResult };
