/** Display helpers shared by client components. Formatting only; no calculations. */

const etDateTime = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "short",
});
const etDate = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric" });

export const formatUsd = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const formatSigned = (n: number, digits = 2) => `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(digits)}`;
export const formatEt = (iso: string) => etDateTime.format(new Date(iso));
export const formatEtDate = (iso: string) => etDate.format(new Date(iso));
export const formatChartDate = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export const FRESHNESS_TEXT: Record<string, string> = {
  INTRADAY: "Intraday (provider timestamp within 20 min; may be delayed)",
  DELAYED: "Delayed (more than 20 min old)",
  PREVIOUS_CLOSE: "Latest close (market closed)",
  STALE: "Stale (older than the latest session)",
  UNKNOWN: "Freshness unknown",
};

export const MARKET_STATUS_TEXT: Record<string, string> = {
  OPEN: "Market open",
  PRE_MARKET: "Pre-market",
  AFTER_HOURS: "After hours",
  CLOSED: "Market closed",
  UNKNOWN: "Market status unknown",
};

export const CLOSED_REASON_TEXT: Record<string, string> = {
  WEEKEND: "weekend",
  HOLIDAY: "US market holiday",
  OVERNIGHT: "overnight",
};
