import type { StockAnalysis } from "@/lib/analysis/build";
import { targetUnavailableText } from "@/lib/analysis/build";
import { CLOSED_REASON_TEXT, FRESHNESS_TEXT, MARKET_STATUS_TEXT, formatEt, formatSigned, formatUsd } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { DirectionBadge } from "./DirectionBadge";

function Stat({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-muted-foreground text-xs uppercase tracking-wide">{label}</dt>
      <dd className="mt-1 text-sm font-medium">{children}</dd>
    </div>
  );
}

export function StockSummary({ stock }: { stock: StockAnalysis }) {
  const { company, quote, target, confidence, direction } = stock;
  const changeTone = !quote ? "" : quote.change > 0 ? "text-up" : quote.change < 0 ? "text-down" : "text-sideways";

  return (
    <section aria-label={`${company.companyName} summary`} className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold leading-tight">
            {company.companyName} <span className="text-muted-foreground font-mono">({company.ticker})</span>
          </h3>
          <p className="text-muted-foreground text-xs">{company.exchange}</p>
        </div>
        {quote && (
          <Badge variant="outline">
            {MARKET_STATUS_TEXT[quote.marketStatus]}
            {quote.marketClosedReason ? ` · ${CLOSED_REASON_TEXT[quote.marketClosedReason]}` : ""}
          </Badge>
        )}
      </div>

      {quote ? (
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-3xl font-semibold tabular-nums">{formatUsd(quote.price)}</span>
          <span className={cn("text-base font-medium tabular-nums", changeTone)}>
            {formatSigned(quote.change)} ({formatSigned(quote.changePercent)}%)
          </span>
          <span className="text-muted-foreground w-full text-xs">
            Last updated {formatEt(quote.quoteTime)}
            {quote.quoteTimeIsDateOnly ? " (trading date only)" : ""} · {FRESHNESS_TEXT[quote.freshness]}
          </span>
        </div>
      ) : (
        <p className="text-sm">Price unavailable.</p>
      )}

      <dl className="grid grid-cols-1 gap-4 rounded-lg border p-4 sm:grid-cols-3">
        <Stat label="Price direction">
          <DirectionBadge direction={direction.direction} />
        </Stat>
        <Stat label="Calculated target range">
          {target.available ? (
            <>
              <span className="tabular-nums">
                {formatUsd(target.low)} – {formatUsd(target.high)}
              </span>
              <span className="text-muted-foreground block text-xs font-normal">
                Statistical range (≈68%) for the next ~{target.horizonSessions} trading days. Not a prediction.
              </span>
            </>
          ) : (
            <span className="text-muted-foreground">TARGET UNAVAILABLE. {targetUnavailableText(target)?.replace("Target unavailable: ", "")}</span>
          )}
        </Stat>
        <Stat label="Confidence level">
          <span className="font-semibold">{confidence.level}</span>
          <span className="text-muted-foreground block text-xs font-normal">
            Rule score {confidence.score}/100: data quality and consistency, not a chance of gain.
          </span>
        </Stat>
      </dl>
    </section>
  );
}
