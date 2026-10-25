import "server-only";

import { scoreArticles, SENTIMENT_WINDOW_DAYS } from "@/lib/analysis/sentiment";
import { addDays, toEastern } from "@/lib/market/calendar";
import { FINNHUB } from "@/lib/providers/finnhub";
import type { ToolContext } from "./context";
import { getNewsSentimentInput, newsSentimentOutput, type NewsSentimentResult } from "./schemas";

/**
 * get_news_sentiment(ticker): recent Finnhub company news scored with VADER.
 * Headlines are untrusted text: control characters are stripped and length is capped,
 * and later phases pass them to the LLM only as quoted data.
 */

const MAX_HEADLINE = 300;
const MAX_SUMMARY = 1_000;

export function sanitizeText(text: string, maxLength: number): string {
  return text
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function safeHttpUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export async function getNewsSentiment(ctx: ToolContext, rawInput: unknown): Promise<NewsSentimentResult> {
  const { ticker } = getNewsSentimentInput.parse(rawInput);
  const now = ctx.now();
  const to = toEastern(now).date;
  const items = await ctx.finnhub.companyNews(ticker, addDays(to, -SENTIMENT_WINDOW_DAYS), to);

  const seen = new Set<string>();
  const articles = items.flatMap((item) => {
    const url = safeHttpUrl(item.url);
    const headline = sanitizeText(item.headline, MAX_HEADLINE);
    const related = item.related?.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean) ?? [];
    if (!url || !headline || item.datetime <= 0) return [];
    if (related.length > 0 && !related.includes(ticker)) return [];
    const key = headline.toLowerCase();
    if (seen.has(url) || seen.has(key)) return [];
    seen.add(url);
    seen.add(key);
    return [
      {
        headline,
        summary: item.summary ? sanitizeText(item.summary, MAX_SUMMARY) : undefined,
        publishedAt: new Date(item.datetime * 1000).toISOString(),
        publisher: sanitizeText(item.source, 100) || "Unknown publisher",
        url,
      },
    ];
  });

  const sentiment = scoreArticles(articles, now);
  return newsSentimentOutput.parse({
    ticker,
    items: sentiment.scored.map((s, i) => ({
      id: `news-${i + 1}`,
      headline: s.article.headline,
      publisher: s.article.publisher,
      publishedAt: s.article.publishedAt,
      url: s.article.url,
      sentimentScore: s.score,
      sentimentLabel: s.label,
    })),
    averageSentiment: sentiment.average,
    sentimentSource: sentiment.source,
    provider: FINNHUB,
    windowDays: SENTIMENT_WINDOW_DAYS,
    fetchedAt: now.toISOString(),
  });
}
