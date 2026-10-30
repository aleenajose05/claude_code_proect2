import type { StockAnalysis } from "@/lib/analysis/build";
import { explanationSchema, type Explanation, type StockExplanation } from "@/lib/llm/schema";

/**
 * Checks Phase B output before anything is shown. Rejects: schema violations, wrong or
 * reordered tickers, unknown evidence ids, numbers that are not in the evidence, mentions
 * of other tickers, contradictions of the server direction, and buy/sell/hold advice.
 */

export type ValidationResult = { ok: true; explanation: Explanation } | { ok: false; problems: string[] };

/** Window sizes and counts the explanation may legitimately mention. */
const ALLOWED_CONSTANTS = [7, 20, 50, 68, 90, 252];

/** Upper-case words that are not tickers. */
const NON_TICKER_WORDS = new Set([
  "A", "I", "AI", "CEO", "CFO", "COO", "CTO", "EPS", "ETF", "US", "USA", "USD", "SMA", "IPO", "FDA", "SEC",
  "GDP", "CPI", "EV", "EVS", "UP", "DOWN", "SIDEWAYS", "HIGH", "MEDIUM", "LOW", "NEWS", "OK", "Q1", "Q2",
  "Q3", "Q4", "FY", "YOY", "API", "PC", "TV", "UK", "EU", "AND", "OR", "THE", "N", "M", "NYSE", "NASDAQ",
]);

const ADVICE_PATTERNS = [
  /\byou should (buy|sell|hold|invest|consider buying|consider selling)\b/i,
  /\b(we|i) (recommend|suggest|advise)\b/i,
  /\b(buy|sell|hold) (now|this stock|the stock|shares)\b/i,
  /\bstrong (buy|sell)\b/i,
  /\bguarantee[sd]?\b/i,
  /\bwill (definitely|certainly|surely)\b/i,
];

const CONTRADICTIONS: Record<string, RegExp> = {
  UP: /\b(down ?trend|bearish|downward|heading down|pointing down)\b/i,
  DOWN: /\b(up ?trend|bullish|upward|heading up|pointing up)\b/i,
  SIDEWAYS: /\b(strong (up|down) ?trend|clearly (bullish|bearish))\b/i,
};

const NUMBER_PATTERN = /\d[\d,]*(?:\.\d+)?/g;

function numbersIn(text: string): { value: number; decimals: number }[] {
  return [...text.matchAll(NUMBER_PATTERN)].map((m) => {
    const raw = m[0].replace(/,/g, "");
    return { value: Number(raw), decimals: raw.includes(".") ? raw.split(".")[1].length : 0 };
  });
}

function allowedNumbers(stocks: readonly StockAnalysis[]): number[] {
  const values = stocks.flatMap((s) => s.evidence.flatMap((e) => numbersIn(e.value).map((n) => n.value)));
  return [...values, ...ALLOWED_CONSTANTS];
}

/** A number is allowed if it equals an evidence value rounded to the precision written, or is a small count. */
function isAllowedNumber(n: { value: number; decimals: number }, allowed: readonly number[]): boolean {
  if (n.decimals === 0 && n.value <= 10) return true;
  const factor = 10 ** n.decimals;
  return allowed.some((a) => Math.round(Math.abs(a) * factor) === Math.round(n.value * factor));
}

function textsOf(stock: StockExplanation): string[] {
  return [stock.directionExplanation, stock.newsSummary, ...stock.reasons.map((r) => r.text), ...stock.risks.map((r) => r.text)];
}

export function validateExplanation(raw: unknown, stocks: readonly StockAnalysis[]): ValidationResult {
  const parsed = explanationSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, problems: parsed.error.issues.map((i) => `schema: ${i.path.join(".")} ${i.message}`) };
  }
  const explanation = parsed.data;
  const problems: string[] = [];
  const tickers = stocks.map((s) => s.company.ticker);
  const allowed = allowedNumbers(stocks);

  if (explanation.stocks.map((s) => s.ticker.toUpperCase()).join(",") !== tickers.join(",")) {
    problems.push(`tickers must be exactly ${tickers.join(", ")} in that order`);
  }
  if ((explanation.comparison !== null) !== (stocks.length === 2)) {
    problems.push(stocks.length === 2 ? "comparison is required for two stocks" : "comparison must be null for one stock");
  }

  const checkText = (text: string, where: string, direction: string | null) => {
    for (const n of numbersIn(text)) {
      if (!isAllowedNumber(n, allowed)) problems.push(`${where}: number ${n.value} is not in the evidence`);
    }
    for (const word of text.match(/\$?\b[A-Z]{1,5}\b/g) ?? []) {
      const token = word.replace("$", "");
      if (token.length >= 2 && !tickers.includes(token) && !NON_TICKER_WORDS.has(token)) {
        problems.push(`${where}: mentions an unexpected ticker or code "${token}"`);
      }
    }
    if (ADVICE_PATTERNS.some((p) => p.test(text))) problems.push(`${where}: contains investment advice or a guarantee`);
    if (direction && CONTRADICTIONS[direction]?.test(text)) problems.push(`${where}: contradicts the ${direction} direction`);
  };

  explanation.stocks.forEach((stockText, i) => {
    const stock = stocks[i];
    if (!stock) return;
    const ids = new Set(stock.evidence.map((e) => e.id));
    for (const point of [...stockText.reasons, ...stockText.risks]) {
      for (const id of point.evidence) {
        if (!ids.has(id)) problems.push(`${stock.company.ticker}: unknown evidence id "${id}"`);
      }
    }
    const direction = stock.direction.direction === "UNAVAILABLE" ? null : stock.direction.direction;
    textsOf(stockText).forEach((text, j) => checkText(text, `${stock.company.ticker} text ${j + 1}`, direction));
  });
  if (explanation.comparison) checkText(explanation.comparison, "comparison", null);
  // The direct answer may cover two stocks, so only stock-independent checks apply to it.
  checkText(explanation.answer, "answer", stocks.length === 1 && stocks[0].direction.direction !== "UNAVAILABLE" ? stocks[0].direction.direction : null);
  explanation.followUps.forEach((q, i) => checkText(q, `follow-up ${i + 1}`, null));

  return problems.length ? { ok: false, problems: [...new Set(problems)] } : { ok: true, explanation };
}
