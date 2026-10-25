import "server-only";
import { ApiError, GoogleGenAI, ThinkingLevel, type Content, type FunctionDeclaration, type GenerateContentConfig } from "@google/genai";

import { AppError } from "@/lib/errors";

/**
 * Thin wrapper over the official @google/genai SDK. The orchestrator depends on the
 * LlmClient interface only, so tests can substitute a scripted fake.
 */

export interface LlmRequest {
  system: string;
  contents: Content[];
  tools?: FunctionDeclaration[];
  /** When set, the model must answer with JSON matching this schema (no tools). */
  jsonSchema?: unknown;
  temperature: number;
  maxOutputTokens: number;
  signal: AbortSignal;
}

export interface LlmResponse {
  model: string;
  /** The model turn, kept intact (including thought signatures) for the next request. */
  content: Content;
  functionCalls: { name: string; args: Record<string, unknown> }[];
  text: string;
  usage: { promptTokens: number; outputTokens: number; totalTokens: number } | null;
}

export interface LlmClient {
  generate(request: LlmRequest): Promise<LlmResponse>;
}

/**
 * The SDK retries 408/429/5xx up to 5 times with exponential backoff by default. That hides
 * the real error and can consume the whole request budget, so retries are disabled here:
 * the app does its own fallback to GEMINI_FALLBACK_MODEL instead.
 */
export const GEMINI_HTTP_OPTIONS = { retryOptions: { attempts: 1 } };

/** Per-call cap, so one slow call leaves time for the fallback model and the explanation. */
const CALL_TIMEOUT_MS = 20_000;

/** Statuses after which the fallback model is worth trying. */
const FALLBACK_STATUSES = new Set([404, 429, 500, 503]);

function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) {
    return new AppError("PROVIDER_TIMEOUT", "Gemini did not respond in time", { provider: "Gemini" });
  }
  if (error instanceof ApiError) {
    if (error.status === 429) return new AppError("PROVIDER_QUOTA", "Gemini quota or rate limit reached", { provider: "Gemini", status: 429 });
    if (error.status === 401 || error.status === 403) {
      return new AppError("PROVIDER_AUTH", "Gemini rejected the API key", { provider: "Gemini", status: error.status });
    }
    return new AppError("PROVIDER_ERROR", `Gemini returned HTTP ${error.status}`, { provider: "Gemini", status: error.status });
  }
  return new AppError("PROVIDER_ERROR", "Gemini request failed", { provider: "Gemini" });
}

/**
 * Keeps reasoning short (this app needs extraction and explanation, not long thinking).
 * Gemini 2.5 takes a token budget; Gemini 3 takes a level and Google advises leaving its
 * temperature at the default, so the low temperature is only applied to 2.5 models.
 */
export function modelTuning(model: string, temperature: number): Partial<GenerateContentConfig> {
  if (/^gemini-2\.5/.test(model)) return { temperature, thinkingConfig: { thinkingBudget: 512 } };
  if (/^gemini-3/.test(model)) return { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } };
  return { temperature };
}

export class GeminiClient implements LlmClient {
  private readonly ai: GoogleGenAI;

  constructor(
    apiKey: string,
    private readonly models: { primary: string; fallback?: string },
  ) {
    this.ai = new GoogleGenAI({ apiKey, httpOptions: GEMINI_HTTP_OPTIONS });
  }

  async generate(request: LlmRequest): Promise<LlmResponse> {
    try {
      return await this.call(this.models.primary, request);
    } catch (error) {
      const status = error instanceof ApiError ? error.status : null;
      const callTimedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
      const worthFallback = callTimedOut || (status !== null && FALLBACK_STATUSES.has(status));
      if (!this.models.fallback || !worthFallback || request.signal.aborted) {
        throw toAppError(error);
      }
      try {
        return await this.call(this.models.fallback, request);
      } catch (fallbackError) {
        throw toAppError(fallbackError);
      }
    }
  }

  private async call(model: string, request: LlmRequest): Promise<LlmResponse> {
    const response = await this.ai.models.generateContent({
      model,
      contents: request.contents,
      config: {
        systemInstruction: request.system,
        maxOutputTokens: request.maxOutputTokens,
        abortSignal: AbortSignal.any([request.signal, AbortSignal.timeout(CALL_TIMEOUT_MS)]),
        ...modelTuning(model, request.temperature),
        ...(request.tools ? { tools: [{ functionDeclarations: request.tools }] } : {}),
        ...(request.jsonSchema
          ? { responseMimeType: "application/json", responseJsonSchema: request.jsonSchema }
          : {}),
      },
    });

    const content = response.candidates?.[0]?.content ?? { role: "model", parts: [] };
    const usage = response.usageMetadata;
    return {
      model,
      content,
      functionCalls: (response.functionCalls ?? []).map((call) => ({ name: call.name ?? "", args: call.args ?? {} })),
      text: (content.parts ?? []).filter((p) => p.text && !p.thought).map((p) => p.text).join(""),
      usage: usage
        ? {
            promptTokens: usage.promptTokenCount ?? 0,
            outputTokens: (usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0),
            totalTokens: usage.totalTokenCount ?? 0,
          }
        : null,
    };
  }
}
