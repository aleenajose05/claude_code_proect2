/**
 * Finds a future time period in a question ("after 60 days", "next month", "in 2 weeks")
 * so the statistical range can match what the user asked. Past periods ("last 90 days")
 * are ignored. Calendar days are converted to trading sessions at 252 sessions per 365 days.
 */

export interface Horizon {
  calendarDays: number;
  sessions: number;
  /** How the period is described to the user, e.g. "60 days". */
  label: string;
}

const MAX_CALENDAR_DAYS = 365;
const UNIT_DAYS: Record<string, number> = { day: 1, week: 7, month: 30, year: 365 };
const WORD_NUMBERS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12,
};

const PERIOD = /\b(next|coming|after|in|within|over|for)?\s*(\d{1,3}|a|an|one|two|three|four|five|six|seven|eight|nine|ten|twelve)?\s*(trading\s+)?(day|week|month|year)s?\b/gi;
const PAST = /\b(last|past|previous|prior|ago)\b/i;

export function sessionsForCalendarDays(days: number): number {
  return Math.max(1, Math.round((days * 252) / 365));
}

export function parseHorizon(question: string): Horizon | null {
  for (const match of question.matchAll(PERIOD)) {
    const [whole, lead, amountText, trading, unitText] = match;
    const before = question.slice(Math.max(0, (match.index ?? 0) - 12), match.index ?? 0);
    if (PAST.test(before) || PAST.test(whole) || /\bago\b/i.test(question.slice((match.index ?? 0) + whole.length, (match.index ?? 0) + whole.length + 5))) continue;
    // "today", "daily" and bare words like "day" with no amount or lead word are not periods.
    if (!amountText && !lead) continue;
    const unit = unitText.toLowerCase();
    const amount = amountText ? (WORD_NUMBERS[amountText.toLowerCase()] ?? Number(amountText)) : 1;
    if (!Number.isFinite(amount) || amount <= 0) continue;

    if (trading && unit === "day") {
      const sessions = Math.min(252, amount);
      return { calendarDays: Math.round((sessions * 365) / 252), sessions, label: `${sessions} trading day${sessions === 1 ? "" : "s"}` };
    }
    const calendarDays = Math.min(MAX_CALENDAR_DAYS, amount * UNIT_DAYS[unit]);
    const label = calendarDays === amount * UNIT_DAYS[unit] ? `${amount} ${unit}${amount === 1 ? "" : "s"}` : "1 year";
    return { calendarDays, sessions: sessionsForCalendarDays(calendarDays), label };
  }
  return null;
}
