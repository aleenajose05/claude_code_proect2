import { usd, type EvidenceItem, type StockAnalysis } from "@/lib/analysis/build";
import type { DetailLevel, Intent } from "@/lib/chat/intent";
import type { Explanation, StockExplanation } from "@/lib/llm/schema";

/**
 * Deterministic explanation built only from server data. Used when the LLM is unavailable
 * or its output fails validation twice. Wording is templated; every number is copied
 * from the evidence catalog.
 */

type Point = StockExplanation["reasons"][number];

function value(stock: StockAnalysis, id: string): string | null {
  return stock.evidence.find((e: EvidenceItem) => e.id === id)?.value ?? null;
}

const relation = (signal: number | null) => (signal === 1 ? "above" : signal === -1 ? "below" : "close to");

function reasonsFor(stock: StockAnalysis): Point[] {
  const { signals } = stock.direction;
  const price = value(stock, "M:PRICE");
  const points: Point[] = [];

  const sma20 = value(stock, "M:SMA20");
  if (price && sma20 && signals.s1 !== null) {
    points.push({ text: `The latest price (${price}) is ${relation(signals.s1)} its 20-day average (${sma20}).`, evidence: ["M:PRICE", "M:SMA20"] });
  }
  const sma50 = value(stock, "M:SMA50");
  if (price && sma50 && signals.s2 !== null) {
    points.push({ text: `The latest price is ${relation(signals.s2)} its 50-day average (${sma50}).`, evidence: ["M:PRICE", "M:SMA50"] });
  }
  if (sma20 && sma50 && signals.s3 !== null) {
    points.push({ text: `The 20-day average is ${relation(signals.s3)} the 50-day average, which shows the shorter-term trend.`, evidence: ["M:SMA20", "M:SMA50"] });
  }
  const r90 = value(stock, "M:R90");
  if (r90) points.push({ text: `Over the 90-day window the price changed by ${r90}.`, evidence: ["M:R90"] });
  const sentiment = value(stock, "M:SENTIMENT");
  if (sentiment) points.push({ text: `Recent headlines have an average sentiment score of ${sentiment} on a −1 to +1 scale.`, evidence: ["M:SENTIMENT"] });
  const change = value(stock, "M:CHANGE");
  if (change) points.push({ text: `Compared with the previous close, the price moved ${change}.`, evidence: ["M:CHANGE"] });
  const range = value(stock, "M:HIGH90") && value(stock, "M:LOW90");
  if (range) points.push({ text: `In the 90-day window the price ranged from ${value(stock, "M:LOW90")} to ${value(stock, "M:HIGH90")}.`, evidence: ["M:LOW90", "M:HIGH90"] });
  points.push({ text: `The overall direction is ${stock.direction.direction}, set by fixed rules rather than by the AI.`, evidence: ["M:DIRECTION"] });
  points.push({ text: `The confidence level is ${stock.confidence.level}, based on how complete and consistent the data is.`, evidence: ["M:CONFIDENCE"] });
  points.push({ text: "Some of the data needed for a fuller explanation is unavailable for this stock.", evidence: ["M:CONFIDENCE"] });
  return points.slice(0, 3);
}

function risksFor(stock: StockAnalysis): Point[] {
  const risks: Point[] = [];
  const vol = value(stock, "M:VOL");
  if (vol) risks.push({ text: `Annualised volatility is ${vol}, so prices can move sharply in either direction.`, evidence: ["M:VOL"] });
  const negative = stock.news?.items.findIndex((n) => n.sentimentLabel === "NEGATIVE") ?? -1;
  if (negative >= 0) {
    risks.push({ text: "At least one recent headline scored as negative, which may weigh on the stock.", evidence: [`N:${negative + 1}`] });
  }
  if (!stock.target.available) {
    risks.push({ text: "A statistical target range could not be calculated, so uncertainty is higher than usual.", evidence: ["M:TARGET"] });
  }
  risks.push({ text: "The direction is based only on past prices and recent headlines; earnings or news can change it quickly.", evidence: ["M:DIRECTION"] });
  risks.push({ text: "The confidence level describes data quality and consistency, not the chance of a gain.", evidence: ["M:CONFIDENCE"] });
  return risks.slice(0, 2);
}

function newsSummaryFor(stock: StockAnalysis): string {
  const items = stock.news?.items ?? [];
  if (!stock.news) return "Recent news is unavailable for this stock.";
  if (items.length === 0) return "No recent news articles were found in the last 7 days.";
  const counts = { POSITIVE: 0, NEGATIVE: 0, NEUTRAL: 0 };
  for (const item of items) counts[item.sentimentLabel]++;
  return `Recent headlines: ${counts.POSITIVE} positive, ${counts.NEGATIVE} negative and ${counts.NEUTRAL} neutral by automated scoring.`;
}

function directionTextFor(stock: StockAnalysis): string {
  if (stock.direction.direction === "UNAVAILABLE") {
    return "The price direction could not be determined because some required price data is unavailable.";
  }
  return `Based on the moving averages, the 90-day return and recent news, the rule-based direction is ${stock.direction.direction}.`;
}

function comparisonFor(stocks: readonly StockAnalysis[]): string {
  const [a, b] = stocks;
  const r = (s: StockAnalysis) => value(s, "M:R90") ?? "unavailable";
  return `Over the 90-day window, ${a.company.ticker} changed by ${r(a)} and ${b.company.ticker} by ${r(b)}. The rule-based direction is ${a.direction.direction} for ${a.company.ticker} and ${b.direction.direction} for ${b.company.ticker}, with ${a.confidence.level} and ${b.confidence.level} confidence respectively.`;
}

const LEANING: Record<string, string> = {
  UP: "leaning bullish",
  DOWN: "leaning bearish",
  SIDEWAYS: "no clear trend either way",
};

function trendSentence(stock: StockAnalysis): string {
  const { direction } = stock.direction;
  if (direction === "UNAVAILABLE") return "Its trend could not be determined from the available data.";
  return `Its rule-based trend is ${direction} (${LEANING[direction]}), with ${stock.confidence.level} confidence.`;
}

function priceSentence(stock: StockAnalysis, name: string): string {
  const q = stock.quote;
  if (!q) return `The latest price for ${name} is unavailable right now.`;
  if (q.change === 0) return `${name} is at ${usd(q.price)}, unchanged from the previous close.`;
  const move = q.change > 0 ? "up" : "down";
  return `${name} is at ${usd(q.price)}, ${move} ${usd(Math.abs(q.change))} (${Math.abs(q.changePercent).toFixed(2)}%) from the previous close.`;
}

function answerForTwo([a, b]: readonly StockAnalysis[]): string {
  const r90 = (s: StockAnalysis) => value(s, "M:R90");
  const parts = [`${priceSentence(a, a.company.ticker)} ${priceSentence(b, b.company.ticker)}`];
  if (r90(a) && r90(b)) parts.push(`Over the last 90 days, ${a.company.ticker} changed by ${r90(a)} and ${b.company.ticker} by ${r90(b)}.`);
  const [da, db] = [a.direction.direction, b.direction.direction];
  if (da === db && da !== "UNAVAILABLE") {
    const confidence =
      a.confidence.level === b.confidence.level
        ? `both with ${a.confidence.level} confidence`
        : `with ${a.confidence.level} and ${b.confidence.level} confidence respectively`;
    parts.push(`Both have a rule-based ${da} trend (${LEANING[da]}), ${confidence}.`);
  } else {
    parts.push(`The rule-based trend is ${da} for ${a.company.ticker} and ${db} for ${b.company.ticker}.`);
  }
  return parts.join(" ");
}

/** "Tesla Inc" -> "Tesla"; keeps the ticker so the stock is unambiguous. */
function shortName(stock: StockAnalysis): string {
  const name = stock.company.companyName.replace(/[,.]?\s+(Inc|Corp|Corporation|Co|Company|Ltd|Plc|Holdings|Group)\.?$/i, "");
  return `${name} (${stock.company.ticker})`;
}

function verdictSentence(stock: StockAnalysis): string {
  const name = shortName(stock);
  const conf = stock.confidence.level;
  switch (stock.direction.direction) {
    case "UP":
      return `${name} looks bullish right now: its rule-based trend is UP, with ${conf} confidence.`;
    case "DOWN":
      return `${name} looks bearish right now: its rule-based trend is DOWN, with ${conf} confidence.`;
    case "SIDEWAYS":
      return `${name} is neither bullish nor bearish right now: its rule-based trend is SIDEWAYS, with ${conf} confidence.`;
    default:
      return `There isn't enough data to say whether ${name} is bullish or bearish right now.`;
  }
}

function rangeSentence(stock: StockAnalysis): string | null {
  const asked = stock.askedTarget;
  if (asked) {
    return asked.range.available
      ? `An exact price ${asked.horizon.label} from now can't be known, but based on its recent volatility it would typically trade between ${usd(asked.range.low)} and ${usd(asked.range.high)} over that period.`
      : `An exact price ${asked.horizon.label} from now can't be known, and there isn't enough recent data to estimate a range.`;
  }
  return stock.target.available
    ? `Over the next ~${stock.target.horizonSessions} trading days its usual range is ${usd(stock.target.low)} to ${usd(stock.target.high)}.`
    : null;
}

const DETAIL_TAIL: Record<DetailLevel, string> = {
  brief: "",
  why: "Here's why, with the main risks for balance.",
  detailed: "Here's the full picture: the reasons, the risks, recent news and the price chart.",
};

/** Direct answer first: the figure the question asked for, then supporting context. */
function answerFor(stocks: readonly StockAnalysis[], intent: Intent): string {
  const tail = DETAIL_TAIL[intent.detail];
  if (stocks.length === 2) return [answerForTwo(stocks), tail].filter(Boolean).join(" ");
  const [stock] = stocks;
  const range = rangeSentence(stock);
  const trend = trendSentence(stock);
  // "Why?" and "explain more" are about the verdict, so they lead with it.
  const focus = intent.focus === "general" && intent.detail !== "brief" ? "direction" : intent.focus;
  let parts: (string | null)[];
  switch (focus) {
    case "direction":
      parts = [verdictSentence(stock), priceSentence(stock, "It"), range];
      break;
    case "future":
    case "range":
      parts = [range ?? "A price range can't be estimated from the available data.", priceSentence(stock, shortName(stock)), trend];
      break;
    case "news":
      parts = [newsSummaryFor(stock), priceSentence(stock, shortName(stock)), trend];
      break;
    case "risks":
      parts = [`The main risks for ${shortName(stock)}: ${risksFor(stock).map((r) => r.text).join(" ")}`, priceSentence(stock, "It")];
      break;
    default:
      parts = [priceSentence(stock, shortName(stock)), trend, range];
  }
  return [...parts, tail].filter(Boolean).join(" ");
}

function followUpsFor(stocks: readonly StockAnalysis[]): string[] {
  if (stocks.length === 2) return ["Which one is more volatile?", "What are the biggest risks for each?", "What is the latest news on both?"];
  const other = stocks[0].company.ticker === "AAPL" ? "Microsoft" : "Apple";
  return ["What are its biggest risks?", "What is the latest news about it?", `Compare it with ${other}`];
}

export function fallbackExplanation(stocks: readonly StockAnalysis[], intent: Intent = { focus: "general", detail: "brief" }): Explanation {
  return {
    answer: answerFor(stocks, intent),
    followUps: followUpsFor(stocks),
    stocks: stocks.map((stock) => ({
      ticker: stock.company.ticker,
      directionExplanation: directionTextFor(stock),
      reasons: reasonsFor(stock),
      risks: risksFor(stock),
      newsSummary: newsSummaryFor(stock),
    })),
    comparison: stocks.length === 2 ? comparisonFor(stocks) : null,
  };
}
