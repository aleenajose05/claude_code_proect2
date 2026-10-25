import { describe, expect, it } from "vitest";

import { EMPTY_CONTEXT, parseStoredContext, serializeContext } from "@/lib/chat/session-context";

describe("browser-session context", () => {
  it("round-trips ticker references", () => {
    const ctx = { activeTicker: "MSFT", secondaryTicker: "AAPL" };
    expect(parseStoredContext(serializeContext(ctx))).toEqual(ctx);
  });

  it("never stores prices or other fields", () => {
    const stored = serializeContext({ activeTicker: "AAPL", secondaryTicker: null, price: 123.45 } as never);
    expect(stored).not.toContain("123.45");
    expect(JSON.parse(stored)).toEqual({ activeTicker: "AAPL", secondaryTicker: null });
  });

  it("drops tampered or corrupt values", () => {
    expect(parseStoredContext('{"activeTicker":"<img src=x>","secondaryTicker":"AAPL"}')).toEqual({ activeTicker: null, secondaryTicker: "AAPL" });
    expect(parseStoredContext("not json")).toEqual(EMPTY_CONTEXT);
    expect(parseStoredContext(null)).toEqual(EMPTY_CONTEXT);
    expect(parseStoredContext("[1,2]")).toEqual(EMPTY_CONTEXT);
  });
});
