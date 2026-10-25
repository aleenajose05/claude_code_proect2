import { afterEach, describe, expect, it, vi } from "vitest";

import { GeminiClient } from "@/lib/llm/gemini";

afterEach(() => vi.unstubAllGlobals());

const request = () => ({
  system: "s",
  contents: [{ role: "user", parts: [{ text: "hi" }] }],
  temperature: 0,
  maxOutputTokens: 16,
  signal: AbortSignal.timeout(30_000),
});

// TEST-ONLY fake Gemini HTTP responses.
function stubGemini(handler: (model: string) => Response) {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request) => {
      const url = String(input instanceof Request ? input.url : input);
      const model = /models\/([^:]+):/.exec(url)?.[1] ?? "?";
      calls.push(model);
      return handler(model);
    }),
  );
  return calls;
}

const quota = () =>
  new Response(JSON.stringify({ error: { code: 429, message: "quota", status: "RESOURCE_EXHAUSTED" } }), {
    status: 429,
    headers: { "Content-Type": "application/json" },
  });
const ok = (text: string) =>
  new Response(JSON.stringify({ candidates: [{ content: { role: "model", parts: [{ text }] } }], usageMetadata: { totalTokenCount: 3 } }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

describe("GeminiClient", () => {
  it("does not let the SDK retry silently, and reports quota errors immediately", async () => {
    const calls = stubGemini(() => quota());
    const started = Date.now();
    await expect(new GeminiClient("test-key", { primary: "model-a" }).generate(request())).rejects.toMatchObject({ code: "PROVIDER_QUOTA" });
    expect(calls).toEqual(["model-a"]);
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it("falls back to the second model once", async () => {
    const calls = stubGemini((model) => (model === "model-a" ? quota() : ok("DONE")));
    const reply = await new GeminiClient("test-key", { primary: "model-a", fallback: "model-b" }).generate(request());
    expect(reply).toMatchObject({ model: "model-b", text: "DONE" });
    expect(calls).toEqual(["model-a", "model-b"]);
  });
});
