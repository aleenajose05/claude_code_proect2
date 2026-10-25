import vader from "vader-sentiment";

/**
 * Deterministic news sentiment using VADER's compound score (already on a −1…+1 scale).
 * The LLM never produces or alters these scores.
 */

export const SENTIMENT_WINDOW_DAYS = 7;
export const MAX_SCORED_ARTICLES = 10;
export const MIN_ARTICLES_FOR_AVERAGE = 3;

export type SentimentLabel = "POSITIVE" | "NEGATIVE" | "NEUTRAL";

export interface ArticleInput {
  headline: string;
  summary?: string;
  /** ISO-8601 timestamp. */
  publishedAt: string;
}

export interface ScoredArticle<T extends ArticleInput = ArticleInput> {
  article: T;
  score: number;
  label: SentimentLabel;
}

export interface SentimentSummary<T extends ArticleInput = ArticleInput> {
  scored: ScoredArticle<T>[];
  /** Mean compound score, or null when fewer than MIN_ARTICLES_FOR_AVERAGE articles qualify. */
  average: number | null;
  source: "VADER (vader-sentiment)";
}

export function labelForScore(score: number): SentimentLabel {
  if (score >= 0.05) return "POSITIVE";
  if (score <= -0.05) return "NEGATIVE";
  return "NEUTRAL";
}

export function scoreText(text: string): number {
  const normalised = text.replace(/\s+/g, " ").trim();
  if (!normalised) return 0;
  return vader.SentimentIntensityAnalyzer.polarity_scores(normalised).compound;
}

export function scoreArticles<T extends ArticleInput>(articles: readonly T[], now: Date): SentimentSummary<T> {
  const windowStart = now.getTime() - SENTIMENT_WINDOW_DAYS * 86_400_000;
  const recent = articles
    .map((article) => ({ article, time: Date.parse(article.publishedAt) }))
    .filter(({ time }) => Number.isFinite(time) && time >= windowStart && time <= now.getTime())
    .sort((a, b) => b.time - a.time)
    .slice(0, MAX_SCORED_ARTICLES);

  const scored = recent.map(({ article }) => {
    const text = article.summary ? `${article.headline}. ${article.summary}` : article.headline;
    const score = scoreText(text);
    return { article, score, label: labelForScore(score) };
  });

  const average =
    scored.length >= MIN_ARTICLES_FOR_AVERAGE
      ? scored.reduce((sum, s) => sum + s.score, 0) / scored.length
      : null;

  return { scored, average, source: "VADER (vader-sentiment)" };
}
