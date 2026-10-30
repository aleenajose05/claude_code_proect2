import { describe, expect, it } from "vitest";

import { parseHorizon } from "@/lib/analysis/horizon";

describe("parseHorizon", () => {
  it.each([
    ["What is the value of Microsoft stock after 60 days?", 60, 41, "60 days"],
    ["Where will Apple be next month?", 30, 21, "1 month"],
    ["NVDA price in 2 weeks", 14, 10, "2 weeks"],
    ["Tesla over the next three months", 90, 62, "3 months"],
    ["AAPL in 10 trading days", 14, 10, "10 trading days"],
    ["Microsoft price in 5 years", 365, 252, "1 year"],
  ])("%s", (question, calendarDays, sessions, label) => {
    expect(parseHorizon(question)).toEqual({ calendarDays, sessions, label });
  });

  it.each([
    "Analyse Amazon using its last 90 days of price history.",
    "What is happening with Apple stock today?",
    "How did Tesla do over the past month?",
    "Compare NVIDIA with Apple",
    "What happened 3 days ago?",
  ])("ignores past or missing periods: %s", (question) => {
    expect(parseHorizon(question)).toBeNull();
  });
});
