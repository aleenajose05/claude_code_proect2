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

/** Plain-language wording for the server's labels ("UP" -> "points upward", "HIGH" -> "high"). */
const TREND_WORDS: Record<string, string> = { UP: "points upward", DOWN: "points downward", SIDEWAYS: "has no clear direction" };
const trendWords = (d: string) => TREND_WORDS[d] ?? "could not be determined";
const conf = (stock: StockAnalysis) => stock.confidence.level.toLowerCase();

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
  points.push({ text: `The overall trend ${trendWords(stock.direction.direction)}, set by fixed rules rather than by the AI.`, evidence: ["M:DIRECTION"] });
  points.push({ text: `Confidence is ${conf(stock)}, based on how complete and consistent the data is.`, evidence: ["M:CONFIDENCE"] });
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
  return `Based on the moving averages, the 90-day return and recent news, the rule-based trend ${trendWords(stock.direction.direction)}.`;
}

function comparisonFor(stocks: readonly StockAnalysis[]): string {
  const [a, b] = stocks;
  const r = (s: StockAnalysis) => value(s, "M:R90") ?? "unavailable";
  return `Over the 90-day window, ${a.company.ticker} changed by ${r(a)} and ${b.company.ticker} by ${r(b)}. The rule-based trend ${trendWords(a.direction.direction)} for ${a.company.ticker} and ${trendWords(b.direction.direction)} for ${b.company.ticker}, with ${conf(a)} and ${conf(b)} confidence respectively.`;
}

const LEANING: Record<string, string> = {
  UP: "leaning bullish",
  DOWN: "leaning bearish",
  SIDEWAYS: "no clear trend either way",
};

function trendSentence(stock: StockAnalysis): string {
  const { direction } = stock.direction;
  if (direction === "UNAVAILABLE") return "Its trend could not be determined from the available data.";
  return `Its rule-based trend ${trendWords(direction)} (${LEANING[direction]}), with ${conf(stock)} confidence.`;
}

function priceSentence(stock: StockAnalysis, name: string): string {
  const q = stock.quote;
  if (!q) return `The latest price for ${name} is unavailable right now.`;
  if (q.change === 0) return `${name} is at ${usd(q.price)}, unchanged from the previous close.`;
  const move = q.change > 0 ? "up" : "down";
  return `${name} is at ${usd(q.price)}, ${move} ${usd(Math.abs(q.change))} (${Math.abs(q.changePercent).toFixed(2)}%) from the previous close.`;
}


/** "Tesla Inc" -> "Tesla"; keeps the ticker so the stock is unambiguous. */
function shortName(stock: StockAnalysis): string {
  const name = stock.company.companyName.replace(/[,.]?\s+(Inc|Corp|Corporation|Co|Company|Ltd|Plc|Holdings|Group)\.?$/i, "");
  return `${name} (${stock.company.ticker})`;
}

/** One short verdict word per direction, used in the first sentence. */
const VERDICT: Record<string, string> = {
  UP: "looks bullish right now",
  DOWN: "looks bearish right now",
  SIDEWAYS: "is neither bullish nor bearish right now",
};

/**
 * A short "because" for the verdict, taken from the strongest agreeing signal, so a bearish
 * label next to a positive 90-day return is not confusing.
 */
function becauseClause(stock: StockAnalysis): string | null {
  const { direction, signals } = stock.direction;
  const sign = direction === "UP" ? 1 : direction === "DOWN" ? -1 : 0;
  if (sign === 0) return direction === "SIDEWAYS" ? "because its signals are mixed" : null;
  const side = sign === 1 ? "above" : "below";
  if (signals.s1 === sign) return `because it's trading ${side} its recent averages`;
  if (signals.s3 === sign) return `because its short-term average is ${side} its longer-term one`;
  if (signals.s4 === sign) return sign === 1 ? "after a strong gain over the last 90 days" : "after falling over the last 90 days";
  return null;
}

function verdictSentence(stock: StockAnalysis, name = shortName(stock)): string {
  const verdict = VERDICT[stock.direction.direction];
  if (!verdict) return `There isn't enough data to say whether ${name} is bullish or bearish right now.`;
  const because = becauseClause(stock);
  return because ? `${name} ${verdict}, ${because}.` : `${name} ${verdict}.`;
}

function changeSentence(stock: StockAnalysis): string | null {
  const q = stock.quote;
  if (!q) return null;
  if (q.change === 0) return "That's unchanged from the previous close.";
  return `That's ${q.change > 0 ? "up" : "down"} ${usd(Math.abs(q.change))} (${Math.abs(q.changePercent).toFixed(2)}%) from the previous close.`;
}

function standardRangeSentence(stock: StockAnalysis): string | null {
  return stock.target.available
    ? `Over the next ~${stock.target.horizonSessions} trading days its usual range is ${usd(stock.target.low)} to ${usd(stock.target.high)}.`
    : null;
}

function newsLead(stock: StockAnalysis, name: string): string {
  const items = stock.news?.items ?? [];
  if (!stock.news) return `Recent news on ${name} is unavailable right now.`;
  if (items.length === 0) return `There's no recent news on ${name} from the last 7 days.`;
  const positive = items.filter((n) => n.sentimentLabel === "POSITIVE").length;
  const negative = items.filter((n) => n.sentimentLabel === "NEGATIVE").length;
  const tone = positive > negative ? "mostly positive" : negative > positive ? "mostly negative" : "mixed";
  return `Recent news on ${name} is ${tone}.`;
}

const DETAIL_TAIL: Record<DetailLevel, string> = {
  brief: "",
  why: "Here's why, with the main risks for balance.",
  detailed: "Here's the full picture: the reasons, the risks, recent news and the price chart.",
};

const paragraphs = (lead: string, rest: (string | null)[]) => {
  const body = rest.filter(Boolean).join(" ");
  return body ? `${lead}\n\n${body}` : lead;
};

function answerForTwo([a, b]: readonly StockAnalysis[], tail: string): string {
  const [na, nb] = [shortName(a), shortName(b)];
  const [da, db] = [a.direction.direction, b.direction.direction];
  const word = (d: string) => ({ UP: "looks bullish", DOWN: "looks bearish", SIDEWAYS: "has no clear trend" })[d] ?? "can't be assessed";
  const [ba, bb] = [becauseClause(a), becauseClause(b)];
  const both = (word: string) => `Both ${na} and ${nb} look ${word} right now${ba && ba === bb ? `, ${ba.replace("it's", "they're").replace("its ", "their ")}` : ""}.`;
  const lead =
    da === db && da === "UP"
      ? both("bullish")
      : da === db && da === "DOWN"
        ? both("bearish")
        : da === db && da === "SIDEWAYS"
          ? `Neither ${na} nor ${nb} has a clear trend right now.`
          : `${na} ${word(da)}${ba ? ` ${ba}` : ""}, while ${nb} ${word(db)}${bb ? ` ${bb}` : ""}.`;
  const r90 = (s: StockAnalysis) => value(s, "M:R90");
  const confidence =
    a.confidence.level === b.confidence.level
      ? `Confidence is ${conf(a)} for both.`
      : `Confidence is ${conf(a)} for ${a.company.ticker} and ${conf(b)} for ${b.company.ticker}.`;
  return paragraphs(lead, [
    priceSentence(a, a.company.ticker),
    priceSentence(b, b.company.ticker).replace(" from the previous close.", "."),
    r90(a) && r90(b) ? `Over the last 90 days, ${a.company.ticker} changed by ${r90(a)} and ${b.company.ticker} by ${r90(b)}.` : null,
    confidence,
    tail,
  ]);
}

/**
 * Like a person answering: the first sentence is the direct answer on its own, then a
 * second paragraph with the supporting figures.
 */
function answerFor(stocks: readonly StockAnalysis[], intent: Intent): string {
  const tail = DETAIL_TAIL[intent.detail];
  if (stocks.length === 2) return answerForTwo(stocks, tail);
  const [stock] = stocks;
  const name = shortName(stock);
  const trend = trendSentence(stock);
  // "Why?" and "explain more" are about the verdict, so they lead with it.
  const focus =
    intent.focus === "general" && stock.askedTarget ? "future" : intent.focus === "general" && intent.detail !== "brief" ? "direction" : intent.focus;

  switch (focus) {
    case "direction":
      return paragraphs(verdictSentence(stock, name), [
        stock.direction.direction === "UNAVAILABLE" ? null : `Its rule-based trend ${trendWords(stock.direction.direction)}, with ${conf(stock)} confidence.`,
        priceSentence(stock, "It"),
        standardRangeSentence(stock),
        tail,
      ]);
    case "future": {
      const asked = stock.askedTarget;
      if (!asked || !asked.range.available) {
        return paragraphs(`An exact future price for ${name} can't be known, and there isn't enough recent data to estimate a range.`, [priceSentence(stock, "It"), trend, tail]);
      }
      return paragraphs(`${name} would typically trade between ${usd(asked.range.low)} and ${usd(asked.range.high)} over the next ${asked.horizon.label}.`, [
        "That's a statistical range based on its recent volatility, not a prediction; an exact future price can't be known.",
        priceSentence(stock, "It"),
        trend,
        tail,
      ]);
    }
    case "range":
      return paragraphs(
        stock.target.available
          ? `${name}'s usual range over the next ~${stock.target.horizonSessions} trading days is ${usd(stock.target.low)} to ${usd(stock.target.high)}.`
          : `A price range for ${name} can't be estimated from the available data.`,
        ["That's a statistical range based on its recent volatility, not a prediction.", priceSentence(stock, "It"), trend, tail],
      );
    case "news":
      return paragraphs(newsLead(stock, name), [newsSummaryFor(stock), priceSentence(stock, "It"), trend, tail]);
    case "risks": {
      const [first, second] = risksFor(stock);
      return paragraphs(`The biggest risk for ${name}: ${first.text}`, [second?.text ?? null, priceSentence(stock, "It"), tail]);
    }
    case "price":
      return paragraphs(stock.quote ? `${name} is at ${usd(stock.quote.price)}.` : `The latest price for ${name} is unavailable right now.`, [
        changeSentence(stock),
        trend,
        standardRangeSentence(stock),
        tail,
      ]);
    default:
      return paragraphs(priceSentence(stock, name), [trend, standardRangeSentence(stock), tail]);
  }
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
