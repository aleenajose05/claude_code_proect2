import "server-only";
import type { Content, FunctionDeclaration } from "@google/genai";

import { AppError } from "@/lib/errors";
import { sanitizeError } from "@/lib/store/redact";
import type { LlmClient, LlmRequest, LlmResponse } from "./gemini";

/**
 * OpenRouter (OpenAI-compatible chat completions), used only as a backup when Gemini fails.
 * Docs: https://openrouter.ai/docs/api_reference/overview
 * The default model "openrouter/free" picks a free model that supports the features the
 * request needs (tool calling, structured outputs). Free use is capped by OpenRouter
 * (50 requests/day without credits at the time of writing).
 *
 * The orchestrator speaks in Gemini's Content format, so requests and responses are
 * translated here and the rest of the app does not change.
 */

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_TIMEOUT_MS = 20_000;

type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

interface CompletionResponse {
  model?: string;
  choices?: { finish_reason?: string | null; message?: { content?: string | null; tool_calls?: ToolCall[] } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  error?: { code?: number | string; message?: string };
}

/** Converts the Gemini-style conversation into chat-completion messages, pairing tool results with their calls. */
export function toChatMessages(system: string, contents: readonly Content[]): ChatMessage[] {
  const messages: ChatMessage[] = [{ role: "system", content: system }];
  let pendingIds: string[] = [];
  let counter = 0;

  for (const content of contents) {
    const parts = content.parts ?? [];
    if (content.role === "model") {
      const text = parts.filter((p) => p.text && !p.thought).map((p) => p.text).join("");
      const calls = parts.filter((p) => p.functionCall);
      pendingIds = calls.map((p) => p.functionCall?.id ?? `call_${++counter}`);
      messages.push({
        role: "assistant",
        content: text || null,
        ...(calls.length
          ? {
              tool_calls: calls.map((p, i) => ({
                id: pendingIds[i],
                type: "function" as const,
                function: { name: p.functionCall?.name ?? "", arguments: JSON.stringify(p.functionCall?.args ?? {}) },
              })),
            }
          : {}),
      });
      continue;
    }
    const responses = parts.filter((p) => p.functionResponse);
    responses.forEach((p, i) => {
      messages.push({
        role: "tool",
        tool_call_id: p.functionResponse?.id ?? pendingIds[i] ?? `call_${++counter}`,
        content: JSON.stringify(p.functionResponse?.response ?? {}),
      });
    });
    const text = parts.filter((p) => p.text).map((p) => p.text).join("\n");
    if (text) messages.push({ role: "user", content: text });
  }
  return messages;
}

function toTools(tools: readonly FunctionDeclaration[]) {
  return tools.map((t) => ({
    type: "function" as const,
    function: { name: t.name ?? "", description: t.description ?? "", parameters: t.parametersJsonSchema ?? { type: "object", properties: {} } },
  }));
}

function statusError(status: number, message: string): AppError {
  const provider = "OpenRouter";
  if (status === 429 || status === 402) return new AppError("PROVIDER_QUOTA", "OpenRouter free quota or rate limit reached", { provider, status });
  if (status === 401 || status === 403) return new AppError("PROVIDER_AUTH", "OpenRouter rejected the API key", { provider, status });
  return new AppError("PROVIDER_ERROR", `OpenRouter returned HTTP ${status}${message ? ` (${sanitizeError(message).slice(0, 120)})` : ""}`, { provider, status });
}

export class OpenRouterClient implements LlmClient {
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
  ) {}

  async generate(request: LlmRequest): Promise<LlmResponse> {
    const body = {
      model: this.model,
      messages: toChatMessages(request.system, request.contents),
      temperature: request.temperature,
      max_tokens: request.maxOutputTokens,
      ...(request.tools ? { tools: toTools(request.tools), tool_choice: "auto" } : {}),
      ...(request.jsonSchema
        ? {
            response_format: { type: "json_schema", json_schema: { name: "explanation", strict: true, schema: request.jsonSchema } },
            // Only route to endpoints that actually enforce the schema.
            provider: { require_parameters: true },
          }
        : {}),
    };

    const startedAt = Date.now();
    let response: Response;
    try {
      response = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          "X-Title": "StockLens AI",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.any([request.signal, AbortSignal.timeout(request.timeoutMs ?? DEFAULT_TIMEOUT_MS)]),
        cache: "no-store",
      });
    } catch (error) {
      const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
      console.warn(`[openrouter] model=${this.model} failed: ${timedOut ? "timeout" : "network"} after ${Date.now() - startedAt} ms`);
      throw timedOut
        ? new AppError("PROVIDER_TIMEOUT", "OpenRouter did not respond in time", { provider: "OpenRouter" })
        : new AppError("PROVIDER_ERROR", "OpenRouter could not be reached", { provider: "OpenRouter" });
    }

    const data = (await response.json().catch(() => null)) as CompletionResponse | null;
    // Errors can arrive as an HTTP error or as HTTP 200 with an "error" object.
    if (!response.ok || !data || data.error) {
      const status = response.ok ? Number(data?.error?.code) || 502 : response.status;
      console.warn(`[openrouter] model=${this.model} failed: status=${status} after ${Date.now() - startedAt} ms`);
      throw statusError(status, data?.error?.message ?? "");
    }

    const choice = data.choices?.[0];
    const message = choice?.message ?? {};
    const toolCalls = message.tool_calls ?? [];
    const functionCalls = toolCalls.map((call) => {
      let args: Record<string, unknown> = {};
      try {
        const parsed: unknown = JSON.parse(call.function.arguments || "{}");
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) args = parsed as Record<string, unknown>;
      } catch {
        args = {};
      }
      return { id: call.id, name: call.function.name, args };
    });
    const text = typeof message.content === "string" ? message.content : "";

    return {
      model: `openrouter:${data.model ?? this.model}`,
      content: {
        role: "model",
        parts: [
          ...(text ? [{ text }] : []),
          ...functionCalls.map((c) => ({ functionCall: { id: c.id, name: c.name, args: c.args } })),
        ],
      },
      functionCalls: functionCalls.map(({ name, args }) => ({ name, args })),
      text,
      finishReason: choice?.finish_reason === "length" ? "MAX_TOKENS" : (choice?.finish_reason ?? null),
      usage: data.usage
        ? { promptTokens: data.usage.prompt_tokens ?? 0, outputTokens: data.usage.completion_tokens ?? 0, totalTokens: data.usage.total_tokens ?? 0 }
        : null,
    };
  }
}
