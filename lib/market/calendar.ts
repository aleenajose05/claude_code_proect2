/**
 * NYSE/Nasdaq regular-session calendar (US Eastern time).
 *
 * The holiday and early-close tables must be updated every year from
 * https://www.nyse.com/markets/hours-calendars. Dates outside the covered
 * years return status "UNKNOWN" rather than guessing.
 */

export const COVERED_YEARS = [2026, 2027] as const;

const HOLIDAYS = new Set([
  // 2026
  "2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03", "2026-05-25",
  "2026-06-19", "2026-07-03", "2026-09-07", "2026-11-26", "2026-12-25",
  // 2027
  "2027-01-01", "2027-01-18", "2027-02-15", "2027-03-26", "2027-05-31",
  "2027-06-18", "2027-07-05", "2027-09-06", "2027-11-25", "2027-12-24",
]);

/** Sessions that close at 13:00 ET. */
const EARLY_CLOSES = new Set(["2026-11-27", "2026-12-24", "2027-11-26"]);

const OPEN_MINUTES = 9 * 60 + 30;
const CLOSE_MINUTES = 16 * 60;
const EARLY_CLOSE_MINUTES = 13 * 60;
const PRE_MARKET_MINUTES = 4 * 60;
const AFTER_HOURS_END_MINUTES = 20 * 60;

const etFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export interface EasternTime {
  /** YYYY-MM-DD in US Eastern time. */
  date: string;
  /** Minutes since midnight Eastern. */
  minutes: number;
}

export function toEastern(instant: Date): EasternTime {
  const parts = Object.fromEntries(etFormatter.formatToParts(instant).map((p) => [p.type, p.value]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

function isCoveredDate(date: string): boolean {
  return (COVERED_YEARS as readonly number[]).includes(Number(date.slice(0, 4)));
}

function weekday(date: string): number {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** true/false for covered years, null when the calendar does not cover the date. */
export function isTradingDay(date: string): boolean | null {
  if (!isCoveredDate(date)) return null;
  const day = weekday(date);
  return day !== 0 && day !== 6 && !HOLIDAYS.has(date);
}

export function closeMinutes(date: string): number {
  return EARLY_CLOSES.has(date) ? EARLY_CLOSE_MINUTES : CLOSE_MINUTES;
}

export type MarketStatus = "OPEN" | "PRE_MARKET" | "AFTER_HOURS" | "CLOSED" | "UNKNOWN";
export type ClosedReason = "WEEKEND" | "HOLIDAY" | "OVERNIGHT" | null;

export function getMarketStatus(now: Date): { status: MarketStatus; reason: ClosedReason } {
  const { date, minutes } = toEastern(now);
  const trading = isTradingDay(date);
  if (trading === null) return { status: "UNKNOWN", reason: null };
  if (!trading) {
    const day = weekday(date);
    return { status: "CLOSED", reason: day === 0 || day === 6 ? "WEEKEND" : "HOLIDAY" };
  }
  const close = closeMinutes(date);
  if (minutes >= OPEN_MINUTES && minutes < close) return { status: "OPEN", reason: null };
  if (minutes >= PRE_MARKET_MINUTES && minutes < OPEN_MINUTES) return { status: "PRE_MARKET", reason: null };
  if (minutes >= close && minutes < AFTER_HOURS_END_MINUTES) return { status: "AFTER_HOURS", reason: null };
  return { status: "CLOSED", reason: "OVERNIGHT" };
}

/** The most recent trading day whose regular session has opened, or null outside covered years. */
export function latestSessionDate(now: Date): string | null {
  const { date, minutes } = toEastern(now);
  let candidate = isTradingDay(date) && minutes >= OPEN_MINUTES ? date : addDays(date, -1);
  for (let i = 0; i < 15; i++) {
    const trading = isTradingDay(candidate);
    if (trading === null) return null;
    if (trading) return candidate;
    candidate = addDays(candidate, -1);
  }
  return null;
}

/** Trading days after `from` up to and including `to` (0 when equal), or null if not covered. */
export function tradingDaysBetween(from: string, to: string): number | null {
  if (from >= to) return 0;
  let count = 0;
  for (let day = addDays(from, 1); day <= to; day = addDays(day, 1)) {
    const trading = isTradingDay(day);
    if (trading === null) return null;
    if (trading) count++;
  }
  return count;
}

export type Freshness = "INTRADAY" | "DELAYED" | "PREVIOUS_CLOSE" | "STALE" | "UNKNOWN";

export const INTRADAY_MAX_AGE_MS = 20 * 60_000;

/**
 * Labels a quote by its own timestamp. Nothing here ever claims "live"/"real-time":
 * INTRADAY only means the provider's timestamp is from the last 20 minutes of the current session.
 */
export function classifyQuoteFreshness(
  quoteTime: Date,
  now: Date,
): { freshness: Freshness; quoteAgeSessions: number | null } {
  const latest = latestSessionDate(now);
  const quoteDate = toEastern(quoteTime).date;
  if (latest === null) return { freshness: "UNKNOWN", quoteAgeSessions: null };
  const age = tradingDaysBetween(quoteDate, latest);
  if (age === null) return { freshness: "UNKNOWN", quoteAgeSessions: null };
  if (age > 0) return { freshness: "STALE", quoteAgeSessions: age };

  if (getMarketStatus(now).status === "OPEN") {
    const ageMs = now.getTime() - quoteTime.getTime();
    return { freshness: ageMs <= INTRADAY_MAX_AGE_MS ? "INTRADAY" : "DELAYED", quoteAgeSessions: 0 };
  }
  return { freshness: "PREVIOUS_CLOSE", quoteAgeSessions: 0 };
}

/** Converts an Eastern wall-clock time on `date` to an instant, handling EST/EDT. */
export function easternWallTime(date: string, minutes: number): Date {
  const [y, m, d] = date.split("-").map(Number);
  // Start from the EST guess (UTC−5), then correct by the observed offset.
  let instant = Date.UTC(y, m - 1, d, 0, minutes + 5 * 60);
  for (let i = 0; i < 2; i++) {
    const observed = toEastern(new Date(instant));
    const dayShift = observed.date === date ? 0 : observed.date > date ? 1440 : -1440;
    const diff = observed.minutes + dayShift - minutes;
    if (diff === 0) break;
    instant -= diff * 60_000;
  }
  return new Date(instant);
}
