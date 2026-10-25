import type { ConversationContext } from "./types";

/** Browser-session conversation memory: ticker references only, never prices or credentials. */

export const CONTEXT_STORAGE_KEY = "stocklens:context:v1";
export const EMPTY_CONTEXT: ConversationContext = { activeTicker: null, secondaryTicker: null };

const TICKER = /^[A-Z]{1,5}(\.[A-Z])?$/;
const ticker = (value: unknown) => (typeof value === "string" && TICKER.test(value) ? value : null);

/** Parses stored context, dropping anything that is not a plain ticker reference. */
export function parseStoredContext(raw: string | null): ConversationContext {
  if (!raw) return EMPTY_CONTEXT;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown> | null;
    if (!parsed || typeof parsed !== "object") return EMPTY_CONTEXT;
    return { activeTicker: ticker(parsed.activeTicker), secondaryTicker: ticker(parsed.secondaryTicker) };
  } catch {
    return EMPTY_CONTEXT;
  }
}

/** Only the two ticker fields are ever written, whatever else the object carries. */
export function serializeContext(context: ConversationContext): string {
  return JSON.stringify({ activeTicker: context.activeTicker, secondaryTicker: context.secondaryTicker });
}
