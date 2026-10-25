import { describe, expect, it } from "vitest";

import { labelForScore, scoreArticles, scoreText } from "@/lib/analysis/sentiment";

const now = new Date("2026-10-25T12:00:00Z");
const article = (headline: string, hoursAgo: number) => ({
  headline,
  publishedAt: new Date(now.getTime() - hoursAgo * 3_600_000).toISOString(),
});

describe("sentiment", () => {
  it("labels scores with the ±0.05 VADER convention", () => {
    expect([labelForScore(0.05), labelForScore(0.049), labelForScore(-0.05)]).toEqual(["POSITIVE", "NEUTRAL", "NEGATIVE"]);
  });

  it("is deterministic and directional", () => {
    const positive = scoreText("Shares surge after strong results beat estimates");
    expect(positive).toBeGreaterThan(0.05);
    expect(scoreText("Shares surge after strong results beat estimates")).toBe(positive);
    expect(scoreText("Company faces lawsuit and weak sales")).toBeLessThan(-0.05);
    expect(scoreText("   ")).toBe(0);
  });

  it("keeps only the 10 most recent articles from the last 7 days", () => {
    const articles = [
      ...Array.from({ length: 12 }, (_, i) => article(`Neutral update ${i}`, i + 1)),
      article("Old great news", 24 * 8),
      article("Future-dated great news", -1),
    ];
    const result = scoreArticles(articles, now);
    expect(result.scored).toHaveLength(10);
    expect(result.scored[0].article.headline).toBe("Neutral update 0");
    expect(result.scored.some((s) => s.article.headline.includes("great"))).toBe(false);
    expect(result.average).toBe(0);
  });

  it("returns a null average with fewer than 3 articles", () => {
    expect(scoreArticles([article("Good", 1), article("Bad", 2)], now).average).toBeNull();
  });
});
