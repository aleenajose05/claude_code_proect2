import { afterEach, describe, expect, it, vi } from "vitest";

import { LlmChain } from "@/lib/llm/chain";
import type { LlmClient } from "@/lib/llm/gemini";
import { OpenRouterClient, toChatMessages } from "@/lib/llm/openrouter";
import { AppError } from "@/lib/errors";

afterEach(() => vi.unstubAllGlobals());

const baseRequest = {
  system: "sys",
  temperature: 0,
  maxOutputTokens: 100,
  signal: AbortSignal.timeout(30_000),
};

// TEST-ONLY fake OpenRouter responses.
function stubOpenRouter(reply: (body: Record<string, unknown>) => Response) {
  const bodies: Record<string, unknown>[] = [];
  const headers: Record<string, string>[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      bodies.push(body);
      headers.push(init.headers as Record<string, string>);
      return reply(body);
    }),
  );
  return { bodies, headers };
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("OpenRouter translation", () => {
  it("turns a Gemini-style tool conversation into chat messages with paired tool results", () => {
    const messages = toChatMessages("sys", [
      { role: "user", parts: [{ text: "Analyse Apple" }] },
      { role: "model", parts: [{ functionCall: { name: "resolve_ticker", args: { query: "Apple" } } }] },
      { role: "user", parts: [{ functionResponse: { name: "resolve_ticker", response: { status: "RESOLVED", ticker: "AAPL" } } }] },
    ]);
    expect(messages[0]).toEqual({ role: "system", content: "sys" });
    expect(messages[1]).toEqual({ role: "user", content: "Analyse Apple" });
    expect(messages[2]).toMatchObject({ role: "assistant", tool_calls: [{ type: "function", function: { name: "resolve_ticker", arguments: '{"query":"Apple"}' } }] });
    const callId = (messages[2] as { tool_calls: { id: string }[] }).tool_calls[0].id;
    expect(messages[3]).toEqual({ role: "tool", tool_call_id: callId, content: '{"status":"RESOLVED","ticker":"AAPL"}' });
  });

  it("sends tools and parses tool calls back into the app's format", async () => {
    const { bodies, headers } = stubOpenRouter(() =>
      json({
        model: "some/free-model",
        choices: [{ finish_reason: "tool_calls", message: { content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "resolve_ticker", arguments: '{"query":"Tesla"}' } }] } }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      }),
    );
    const reply = await new OpenRouterClient("test-or-key", "openrouter/free").generate({
      ...baseRequest,
      contents: [{ role: "user", parts: [{ text: "Is Tesla bullish?" }] }],
      tools: [{ name: "resolve_ticker", description: "d", parametersJsonSchema: { type: "object" } }],
    });
    expect(bodies[0]).toMatchObject({ model: "openrouter/free", tool_choice: "auto", tools: [{ type: "function", function: { name: "resolve_ticker" } }] });
    expect(headers[0].Authorization).toBe("Bearer test-or-key");
    expect(reply.functionCalls).toEqual([{ name: "resolve_ticker", args: { query: "Tesla" } }]);
    expect(reply.model).toBe("openrouter:some/free-model");
    expect(reply.usage).toEqual({ promptTokens: 10, outputTokens: 5, totalTokens: 15 });
  });

  it("requests a strict JSON schema and flags cut-off answers", async () => {
    const { bodies } = stubOpenRouter(() => json({ choices: [{ finish_reason: "length", message: { content: '{"answer":' } }] }));
    const reply = await new OpenRouterClient("k", "openrouter/free").generate({
      ...baseRequest,
      contents: [{ role: "user", parts: [{ text: "data" }] }],
      jsonSchema: { type: "object" },
    });
    expect(bodies[0]).toMatchObject({ response_format: { type: "json_schema", json_schema: { strict: true } }, provider: { require_parameters: true } });
    expect(reply.finishReason).toBe("MAX_TOKENS");
  });

  it("reports quota and in-body errors as typed errors", async () => {
    stubOpenRouter(() => json({ error: { code: 429, message: "Rate limit exceeded: free-models-per-day" } }, 429));
    await expect(new OpenRouterClient("k", "m").generate({ ...baseRequest, contents: [] })).rejects.toMatchObject({ code: "PROVIDER_QUOTA" });
    stubOpenRouter(() => json({ error: { code: 503, message: "No endpoints available" } }));
    await expect(new OpenRouterClient("k", "m").generate({ ...baseRequest, contents: [] })).rejects.toMatchObject({ code: "PROVIDER_ERROR" });
  });
});

describe("LlmChain", () => {
  const client = (fn: () => Promise<unknown>): LlmClient => ({ generate: fn as LlmClient["generate"] });

  it("uses the next provider only when the previous one fails", async () => {
    const second = vi.fn(async () => ({ model: "backup", text: "OK" }));
    const ok = await new LlmChain([client(async () => ({ model: "first", text: "OK" })), client(second)]).generate({ ...baseRequest, contents: [] });
    expect(ok.model).toBe("first");
    expect(second).not.toHaveBeenCalled();

    const fallback = await new LlmChain([
      client(async () => {
        throw new AppError("PROVIDER_ERROR", "Gemini returned HTTP 503", { status: 503 });
      }),
      client(second),
    ]).generate({ ...baseRequest, contents: [] });
    expect(fallback.model).toBe("backup");
  });

  it("reports the last provider's error when all fail", async () => {
    const chain = new LlmChain([
      client(async () => {
        throw new AppError("PROVIDER_ERROR", "first");
      }),
      client(async () => {
        throw new AppError("PROVIDER_QUOTA", "second");
      }),
    ]);
    await expect(chain.generate({ ...baseRequest, contents: [] })).rejects.toMatchObject({ code: "PROVIDER_QUOTA" });
  });
});
