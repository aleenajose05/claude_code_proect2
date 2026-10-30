/**
 * What the user is asking for, detected without the LLM so the answer can lead with it:
 *  - focus: the figure the first sentence should give
 *  - detail: brief (default), why (balanced reasons and risks) or detailed (everything)
 */

export type AnswerFocus = "direction" | "future" | "price" | "range" | "news" | "risks" | "compare" | "general";
export type DetailLevel = "brief" | "why" | "detailed";

export interface Intent {
  focus: AnswerFocus;
  detail: DetailLevel;
}

const DETAILED = /\b(explain (it |this |that )?(more|further|in detail)|more detail|in detail|detailed|elaborate|tell me more|go deeper|full (analysis|breakdown)|break (it )?down)\b/i;
const WHY = /^\s*why\b|\bwhy (is|does|do|are|did|would)\b|\breasons?\b|\bhow come\b|\bwhat makes\b/i;

export function detectIntent(question: string, options: { stockCount?: number; hasHorizon?: boolean } = {}): Intent {
  const q = question.toLowerCase();
  const detail: DetailLevel = DETAILED.test(question) ? "detailed" : WHY.test(question) ? "why" : "brief";

  let focus: AnswerFocus = "general";
  if ((options.stockCount ?? 1) === 2 || /\b(compare|versus|vs|better than)\b/.test(q)) {
    focus = "compare";
  } else if (options.hasHorizon) {
    focus = "future";
  } else if (/\b(bullish|bearish|trend|direction|going up|going down|up or down|outlook)\b/.test(q)) {
    focus = "direction";
  } else if (/\b(target|range|forecast|predict|prediction)\b/.test(q)) {
    focus = "range";
  } else if (/\b(news|headlines?|happening|latest)\b/.test(q)) {
    focus = "news";
  } else if (/\b(risks?|risky|downside|danger)\b/.test(q)) {
    focus = "risks";
  } else if (/\b(price|value|worth|cost|trading at|how much|quote)\b/.test(q)) {
    focus = "price";
  }
  return { focus, detail };
}
