import { describe, expect, it } from "vitest";

import {
  classifyQuoteFreshness,
  easternWallTime,
  getMarketStatus,
  isTradingDay,
  latestSessionDate,
  toEastern,
  tradingDaysBetween,
} from "@/lib/market/calendar";

describe("market calendar", () => {
  it("converts to Eastern time across daylight saving", () => {
    expect(toEastern(new Date("2026-03-09T13:30:00Z"))).toEqual({ date: "2026-03-09", minutes: 570 }); // EDT
    expect(toEastern(new Date("2026-01-05T14:30:00Z"))).toEqual({ date: "2026-01-05", minutes: 570 }); // EST
    expect(easternWallTime("2026-10-23", 960).toISOString()).toBe("2026-10-23T20:00:00.000Z");
    expect(easternWallTime("2026-12-01", 960).toISOString()).toBe("2026-12-01T21:00:00.000Z");
    expect(easternWallTime("2026-11-27", 780).toISOString()).toBe("2026-11-27T18:00:00.000Z");
  });

  it("knows weekends, holidays, early closes and uncovered years", () => {
    expect(isTradingDay("2026-10-26")).toBe(true);
    expect(isTradingDay("2026-11-26")).toBe(false);
    expect(isTradingDay("2028-01-03")).toBeNull();
    expect(getMarketStatus(new Date("2026-10-26T14:00:00Z"))).toEqual({ status: "OPEN", reason: null });
    expect(getMarketStatus(new Date("2026-10-26T12:00:00Z")).status).toBe("PRE_MARKET");
    expect(getMarketStatus(new Date("2026-10-26T21:00:00Z")).status).toBe("AFTER_HOURS");
    expect(getMarketStatus(new Date("2026-10-27T03:00:00Z"))).toEqual({ status: "CLOSED", reason: "OVERNIGHT" });
    expect(getMarketStatus(new Date("2026-10-24T15:00:00Z"))).toEqual({ status: "CLOSED", reason: "WEEKEND" });
    expect(getMarketStatus(new Date("2026-11-26T15:00:00Z"))).toEqual({ status: "CLOSED", reason: "HOLIDAY" });
    expect(getMarketStatus(new Date("2026-11-27T18:30:00Z")).status).toBe("AFTER_HOURS"); // 13:30 after early close
    expect(getMarketStatus(new Date("2028-01-03T15:00:00Z")).status).toBe("UNKNOWN");
  });

  it("finds the latest session and counts sessions between dates", () => {
    expect(latestSessionDate(new Date("2026-10-25T15:00:00Z"))).toBe("2026-10-23"); // Sunday
    expect(latestSessionDate(new Date("2026-10-26T12:00:00Z"))).toBe("2026-10-23"); // Monday before open
    expect(latestSessionDate(new Date("2026-10-26T14:00:00Z"))).toBe("2026-10-26");
    expect(latestSessionDate(new Date("2026-11-27T13:00:00Z"))).toBe("2026-11-25"); // before open, after Thanksgiving
    expect(tradingDaysBetween("2026-11-25", "2026-11-30")).toBe(2);
    expect(tradingDaysBetween("2026-10-23", "2026-10-23")).toBe(0);
  });

  it("labels quote freshness without ever claiming live data", () => {
    const mondayOpen = new Date("2026-10-26T14:00:00Z");
    expect(classifyQuoteFreshness(new Date("2026-10-26T13:55:00Z"), mondayOpen)).toEqual({ freshness: "INTRADAY", quoteAgeSessions: 0 });
    expect(classifyQuoteFreshness(new Date("2026-10-26T13:31:00Z"), mondayOpen)).toEqual({ freshness: "DELAYED", quoteAgeSessions: 0 });
    expect(classifyQuoteFreshness(new Date("2026-10-23T20:00:00Z"), mondayOpen)).toEqual({ freshness: "STALE", quoteAgeSessions: 1 });
    const sunday = new Date("2026-10-25T15:00:00Z");
    expect(classifyQuoteFreshness(new Date("2026-10-23T20:00:00Z"), sunday)).toEqual({ freshness: "PREVIOUS_CLOSE", quoteAgeSessions: 0 });
    expect(classifyQuoteFreshness(new Date("2028-01-03T20:00:00Z"), new Date("2028-01-04T15:00:00Z")).freshness).toBe("UNKNOWN");
  });
});
