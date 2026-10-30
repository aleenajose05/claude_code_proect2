import { afterEach, describe, expect, it, vi } from "vitest";

import { noCache, type DataCache } from "@/lib/chat/cache";
import { runChat } from "@/lib/chat/orchestrator";
import { Trace } from "@/lib/chat/trace";
import { chatRequestSchema, DISCLAIMER } from "@/lib/chat/types";
import { testContext } from "../tools/fake-fetch";
import { call, fakeLlm, goodExplanation, installMarketFakes, NOW } from "./fixtures";

afterEach(() => vi.unstubAllGlobals());

function run(question: string, llm: ReturnType<typeof fakeLlm>, options: { context?: object; deadlineMs?: number; cache?: DataCache } = {}) {
  const trace = new Trace();
  const request = chatRequestSchema.parse({ question, context: options.context });
  const promise = runChat(request, {
    tools: testContext(NOW),
    llm: llm.client,
    cache: options.cache ?? noCache,
    trace,
    deadline: Date.now() + (options.deadlineMs ?? 45_000),
  });
  return { trace, promise };
}

/** Phase A resolves the given queries in one turn, then says DONE; Phase B returns `explanation`. */
function standardScript(queries: string[], explanation: (i: number) => string) {
  return fakeLlm((request, i) => {
    if (request.tools) return i === 0 ? { functionCalls: queries.map((q) => call("resolve_ticker", { query: q })) } : { text: "DONE" };
    return { text: explanation(i) };
  });
}

describe("runChat", () => {
  it("runs the full two-phase workflow for one stock", async () => {
    const fake = installMarketFakes();
    const llm = standardScript(["Apple"], () => goodExplanation(["AAPL"]));
    const { promise, trace } = run("Analyse Apple stock", llm);
    const result = await promise;

    expect(result.kind).toBe("analysis");
    if (result.kind !== "analysis") return;
    const [stock] = result.stocks;
    expect(stock.company.ticker).toBe("AAPL");
    expect(stock.quote?.price).toBeCloseTo(100 + 0.4 * 62, 10); // from the fake quote, not the LLM
    expect(stock.history?.candles.length).toBeGreaterThan(50);
    expect(stock.news?.items).toHaveLength(3);
    expect(stock.direction.direction).toBe("UP");
    expect(result.explanationSource).toBe("AI");
    expect(result.disclaimer).toBe(DISCLAIMER);
    expect(result.context).toEqual({ activeTicker: "AAPL", secondaryTicker: null });
    expect(trace.validation).toBe("PASSED");

    // Phase A sees tools; Phase B has none and gets only evidence, never raw candles.
    expect(llm.requests[0].tools?.map((t) => t.name)).toEqual(["resolve_ticker", "get_quote", "get_price_history", "get_news_sentiment"]);
    const phaseB = llm.requests.at(-1)!;
    expect(phaseB.tools).toBeUndefined();
    expect(phaseB.jsonSchema).toBeDefined();
    expect(JSON.stringify(phaseB.contents)).toContain("M:SMA20");
    expect(JSON.stringify(phaseB.contents)).not.toContain("adjClose");
    // Each dataset fetched once.
    const paths = fake.calls.map((c) => c.url.pathname);
    expect(paths.filter((p) => p === "/api/v1/quote")).toHaveLength(1);
    expect(paths.filter((p) => p.includes("/prices"))).toHaveLength(1);
  });

  it("retries once and then falls back to the deterministic explanation", async () => {
    installMarketFakes();
    const invented = goodExplanation(["AAPL"]).replace("The 90-day return summarises recent performance.", "The stock will reach 999.99 next week.");
    const { promise, trace } = run("Analyse AAPL", standardScript(["AAPL"], () => invented));
    const result = await promise;
    expect(result.kind === "analysis" && result.explanationSource).toBe("FALLBACK");
    expect(trace.validation).toBe("FALLBACK");
    expect(trace.steps.filter((s) => s.name.startsWith("Gemini explanation"))).toHaveLength(2);
    if (result.kind === "analysis") expect(result.notices.join(" ")).toContain("rule-based summary");
  });

  it("tells the user why the AI explanation was not used", async () => {
    installMarketFakes();
    const cutOff = fakeLlm((request, i) =>
      request.tools ? (i === 0 ? { functionCalls: [call("resolve_ticker", { query: "AAPL" })] } : { text: "DONE" }) : { text: '{"stocks":[{"tick', finishReason: "MAX_TOKENS" },
    );
    const result = await run("Analyse AAPL", cutOff).promise;
    expect(result.kind === "analysis" && result.notices.join(" ")).toContain("cut off");
  });

  it("accepts a valid answer on the retry", async () => {
    installMarketFakes();
    let explanations = 0;
    const llm = fakeLlm((request, i) => {
      if (request.tools) return i === 0 ? { functionCalls: [call("resolve_ticker", { query: "AAPL" })] } : { text: "DONE" };
      return { text: explanations++ === 0 ? "not json" : goodExplanation(["AAPL"]) };
    });
    const { promise, trace } = run("Analyse AAPL", llm);
    expect((await promise).kind).toBe("analysis");
    expect(trace.validation).toBe("PASSED_AFTER_RETRY");
  });

  it("compares two stocks and requires a comparison", async () => {
    installMarketFakes();
    const { promise } = run("Compare NVIDIA with Apple", standardScript(["NVIDIA", "Apple"], () => goodExplanation(["NVDA", "AAPL"])));
    const result = await promise;
    expect(result.kind).toBe("analysis");
    if (result.kind !== "analysis") return;
    expect(result.stocks.map((s) => s.company.ticker)).toEqual(["NVDA", "AAPL"]);
    expect(result.explanation.comparison).not.toBeNull();
    expect(result.context).toEqual({ activeTicker: "NVDA", secondaryTicker: "AAPL" });
  });

  it("refuses more than two stocks before calling any financial API", async () => {
    const fake = installMarketFakes();
    const { promise } = run("Compare Apple, Microsoft and NVIDIA", standardScript(["Apple", "Microsoft", "NVIDIA"], () => ""));
    const result = await promise;
    expect(result.kind).toBe("clarification");
    expect(result.kind === "clarification" && result.message).toContain("at most two");
    expect(fake.calls).toHaveLength(0);
  });

  it("resolves follow-up questions from validated context and updates it", async () => {
    installMarketFakes();
    const llm = fakeLlm((request, i) => {
      if (request.tools) return i === 0 ? { functionCalls: [call("get_news_sentiment", { ticker: "AAPL" })] } : { text: "DONE" };
      return { text: goodExplanation(["AAPL"]) };
    });
    const { promise } = run("What are its biggest risks?", llm, { context: { activeTicker: "AAPL", secondaryTicker: null } });
    const result = await promise;
    expect(result.kind === "analysis" && result.stocks[0].company.ticker).toBe("AAPL");

    // "What about Microsoft?" switches the active ticker and remembers the previous one.
    const next = run("What about Microsoft?", standardScript(["Microsoft"], () => goodExplanation(["MSFT"])), {
      context: { activeTicker: "AAPL", secondaryTicker: null },
    });
    const switched = await next.promise;
    expect(switched.context).toEqual({ activeTicker: "MSFT", secondaryTicker: "AAPL" });
  });

  it("does not let the model fetch data for unverified tickers", async () => {
    const fake = installMarketFakes();
    const llm = fakeLlm((request, i) => (i === 0 ? { functionCalls: [call("get_quote", { ticker: "NVDA" })] } : { text: "DONE" }));
    const result = await run("How is it doing?", llm).promise;
    expect(result.kind).toBe("clarification");
    expect(fake.calls).toHaveLength(0);
    const toolReply = JSON.stringify(llm.requests[1].contents.at(-1));
    expect(toolReply).toContain("has not been verified");
  });

  it("answers non-stock questions without calling tools", async () => {
    installMarketFakes();
    const result = await run("What's the weather in Paris?", fakeLlm(() => ({ text: "OUT_OF_SCOPE" }))).promise;
    expect(result.kind).toBe("out_of_scope");
  });

  it("asks for clarification when a company cannot be resolved", async () => {
    installMarketFakes();
    const result = await run("Analyse Zzzqx Corp", standardScript(["Zzzqx Corp"], () => "")).promise;
    expect(result.kind).toBe("clarification");
  });

  it("bounds the tool-calling loop", async () => {
    installMarketFakes();
    const llm = fakeLlm((request) => (request.tools ? { functionCalls: [call("resolve_ticker", { query: "AAPL" })] } : { text: goodExplanation(["AAPL"]) }));
    const { promise, trace } = run("Analyse AAPL", llm);
    expect((await promise).kind).toBe("analysis");
    expect(llm.requests.filter((r) => r.tools)).toHaveLength(5);
    expect(trace.steps.some((s) => s.name === "Tool-calling loop reached its limit")).toBe(true);
  });

  it("keeps working by keyword matching when Gemini is down", async () => {
    installMarketFakes();
    const failing = () =>
      fakeLlm(() => {
        throw new Error("boom");
      });
    const byTicker = await run("What is the target range for AAPL?", failing()).promise;
    expect(byTicker.kind).toBe("analysis");
    if (byTicker.kind === "analysis") {
      expect(byTicker.stocks[0].company.ticker).toBe("AAPL");
      expect(byTicker.explanationSource).toBe("FALLBACK");
      expect(byTicker.notices.join(" ")).toContain("identified by name or ticker matching");
    }
    const byName = await run("Compare Microsoft with Apple", failing()).promise;
    expect(byName.kind === "analysis" && byName.stocks.map((s) => s.company.ticker)).toEqual(["MSFT", "AAPL"]);
    const followUp = await run("What are its risks?", failing(), { context: { activeTicker: "NVDA", secondaryTicker: null } }).promise;
    expect(followUp.kind === "analysis" && followUp.stocks[0].company.ticker).toBe("NVDA");
    const notStock = await run("is buying an 18 pro now worth it", failing()).promise;
    expect(notStock).toMatchObject({ kind: "clarification" });
    const tooMany = await run("Compare Apple, Microsoft and NVIDIA", failing()).promise;
    expect(tooMany.kind === "clarification" && tooMany.message).toContain("at most two");
  });

  it("leads with what was asked and follows up with why / more detail", async () => {
    installMarketFakes();
    const noExplanation = (tickerCalls: string[]) =>
      fakeLlm((request, i) =>
        request.tools
          ? i === 0 && tickerCalls.length
            ? { functionCalls: tickerCalls.map((q) => call("resolve_ticker", { query: q })) }
            : { text: "DONE" }
          : { text: "not json" },
      );

    const verdict = await run("Is Apple looking bullish or bearish?", noExplanation(["Apple"])).promise;
    expect(verdict.kind).toBe("analysis");
    if (verdict.kind !== "analysis") return;
    expect(verdict.intent).toEqual({ focus: "direction", detail: "brief" });
    expect(verdict.explanation.answer.startsWith("Apple (AAPL) looks bullish right now")).toBe(true);

    // "Why?" with no stock named: the model links nothing, the app uses the stock being discussed.
    const why = await run("Why?", noExplanation([]), { context: verdict.context }).promise;
    expect(why.kind === "analysis" && why.stocks[0].company.ticker).toBe("AAPL");
    expect(why.kind === "analysis" && why.intent.detail).toBe("why");

    const more = await run("Explain in more detail", noExplanation([]), { context: verdict.context }).promise;
    expect(more.kind === "analysis" && more.intent.detail).toBe("detailed");
  });

  it("reports time-budget exhaustion as a typed error", async () => {
    installMarketFakes();
    expect(await run("Analyse AAPL", standardScript(["AAPL"], () => "")).promise.then((r) => r.kind)).not.toBe("error");
    expect(await run("Analyse AAPL", standardScript(["AAPL"], () => ""), { deadlineMs: 1_000 }).promise).toMatchObject({ kind: "error", code: "TIMEOUT" });
  });

  it("returns a partial analysis with lower confidence when news is unavailable", async () => {
    const fake = installMarketFakes();
    const base = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      if (String(input).includes("company-news")) return new Response("{}", { status: 503 });
      return base(input, init);
    });
    const result = await run("Analyse AAPL", standardScript(["AAPL"], () => "bad")).promise;
    expect(fake).toBeDefined();
    expect(result.kind).toBe("analysis");
    if (result.kind !== "analysis") return;
    expect(result.stocks[0].news).toBeNull();
    expect(result.stocks[0].missing.join(" ")).toContain("News unavailable");
    expect(result.stocks[0].confidence.breakdown.providerReliability).toBe(0);
  });
});
