import { describe, expect, it } from "vitest";

import { detectIntent } from "@/lib/chat/intent";

describe("detectIntent", () => {
  it.each([
    ["Is Tesla looking bullish or bearish?", "direction", "brief"],
    ["Why?", "general", "why"],
    ["Why is it going up?", "direction", "why"],
    ["Explain more", "general", "detailed"],
    ["Can you explain it in detail?", "general", "detailed"],
    ["Tell me more about the risks", "risks", "detailed"],
    ["What is the price of Apple?", "price", "brief"],
    ["What is the calculated target range for AAPL?", "range", "brief"],
    ["What are the latest news affecting Google stock?", "news", "brief"],
    ["What are its biggest risks?", "risks", "brief"],
    ["Compare NVIDIA with Apple", "compare", "brief"],
  ])("%s", (question, focus, detail) => {
    expect(detectIntent(question)).toEqual({ focus, detail });
  });

  it("uses the horizon and stock count when known", () => {
    expect(detectIntent("Where could Microsoft be in 60 days?", { hasHorizon: true }).focus).toBe("future");
    expect(detectIntent("NVDA and AAPL", { stockCount: 2 }).focus).toBe("compare");
  });
});
