"use client";

import { ChevronDown, Info } from "lucide-react";
import { useState } from "react";

import type { StockAnalysis } from "@/lib/analysis/build";
import type { ChatResult } from "@/lib/chat/types";
import type { StockExplanation } from "@/lib/llm/schema";
import { FRESHNESS_TEXT, formatEt, formatSigned, formatUsd } from "@/lib/format";
import { cn } from "@/lib/utils";
import { DirectionBadge } from "@/components/stock/DirectionBadge";
import { NewsSentiment } from "@/components/stock/NewsSentiment";
import { PriceChart } from "@/components/stock/PriceChart";
import { StockSummary } from "@/components/stock/StockSummary";

/** One compact line of the key numbers, so the answer stays conversational. */
function KeyFigures({ stock }: { stock: StockAnalysis }) {
  const { quote, company, confidence, direction } = stock;
  const range = stock.askedTarget?.range ?? stock.target;
  const rangeLabel = stock.askedTarget ? `Range, ${stock.askedTarget.horizon.label}` : "Range, ~20 trading days";
  const tone = !quote ? "" : quote.change > 0 ? "text-up" : quote.change < 0 ? "text-down" : "text-sideways";
  return (
    <dl className="bg-muted/40 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl border px-4 py-3 text-sm">
      <div>
        <dt className="sr-only">Stock</dt>
        <dd className="font-semibold">{company.ticker}</dd>
      </div>
      <div>
        <dt className="sr-only">Price</dt>
        <dd className="tabular-nums">
          {quote ? (
            <>
              <span className="font-semibold">{formatUsd(quote.price)}</span>{" "}
              <span className={tone}>({formatSigned(quote.changePercent)}%)</span>
            </>
          ) : (
            "Price unavailable"
          )}
        </dd>
      </div>
      <div>
        <dt className="sr-only">Direction</dt>
        <dd>
          <DirectionBadge direction={direction.direction} className="px-1.5 py-0.5 text-xs" />
        </dd>
      </div>
      <div>
        <dt className="text-muted-foreground inline text-xs">{rangeLabel}: </dt>
        <dd className="inline tabular-nums">{range.available ? `${formatUsd(range.low)} – ${formatUsd(range.high)}` : "unavailable"}</dd>
      </div>
      <div>
        <dt className="text-muted-foreground inline text-xs">Confidence: </dt>
        <dd className="inline font-medium">{confidence.level}</dd>
      </div>
    </dl>
  );
}

function ShortExplanation({ text, showTicker }: { text: StockExplanation; showTicker: boolean }) {
  return (
    <div className="space-y-3 text-base leading-relaxed">
      {showTicker && <p className="font-semibold">{text.ticker}</p>}
      <div>
        <p className="font-medium">Why</p>
        <ul className="mt-1 list-disc space-y-1 pl-5">
          {text.reasons.map((r) => (
            <li key={r.text}>{r.text}</li>
          ))}
        </ul>
      </div>
      <div>
        <p className="font-medium">Risks to keep in mind</p>
        <ul className="mt-1 list-disc space-y-1 pl-5">
          {text.risks.map((r) => (
            <li key={r.text}>{r.text}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Sources({ stock }: { stock: StockAnalysis }) {
  const rows: [string, string][] = [];
  if (stock.quote) {
    rows.push(["Quote", `${stock.quote.provider}${stock.quote.usedFallback ? " (fallback)" : ""} · quote time ${formatEt(stock.quote.quoteTime)} · fetched ${formatEt(stock.quote.fetchedAt)} · ${FRESHNESS_TEXT[stock.quote.freshness]}`]);
  }
  if (stock.history) {
    rows.push(["Price history", `${stock.history.provider}${stock.history.usedFallback ? " (fallback)" : ""} · ${stock.history.from} to ${stock.history.to} · ${stock.history.adjusted ? "adjusted" : "unadjusted"} · fetched ${formatEt(stock.history.fetchedAt)}`]);
  }
  if (stock.news) rows.push(["News", `${stock.news.provider} · last ${stock.news.windowDays} days · fetched ${formatEt(stock.news.fetchedAt)} · sentiment: ${stock.news.sentimentSource}`]);
  const cache = (["quote", "history", "news"] as const).map((k) => `${k} ${stock.cache[k] ?? "n/a"}`).join(", ");
  rows.push(["Cache", `${cache}. HIT means served from the app cache with its original fetch time.`]);
  return (
    <dl className="grid gap-1.5 text-xs">
      {rows.map(([label, value]) => (
        <div key={label} className="grid gap-0.5 sm:grid-cols-[7rem_1fr]">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="break-words">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Details({ stock, newsSummary }: { stock: StockAnalysis; newsSummary: string | undefined }) {
  return (
    <div className="space-y-5">
      <StockSummary stock={stock} />
      {stock.missing.length > 0 && (
        <ul className="text-muted-foreground list-disc space-y-1 pl-5 text-xs">
          {stock.missing.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      )}
      {stock.history && stock.history.candles.length > 1 && (
        <PriceChart history={stock.history} direction={stock.direction.direction} ticker={stock.company.ticker} />
      )}
      <section className="space-y-2">
        <h4 className="text-sm font-semibold">Recent news and sentiment</h4>
        {newsSummary && <p className="text-sm">{newsSummary}</p>}
        <NewsSentiment news={stock.news} />
      </section>
      <section className="space-y-2">
        <h4 className="text-sm font-semibold">Financial data sources</h4>
        <Sources stock={stock} />
      </section>
    </div>
  );
}

const WHY_CHIP = "Why?";
const MORE_CHIP = "Explain in more detail";

export function AnswerCard({ result, onAsk }: { result: ChatResult; onAsk?: (question: string) => void }) {
  const detail = result.kind === "analysis" ? result.intent.detail : "brief";
  // "Explain more" answers open the chart, news and sources straight away.
  const [open, setOpen] = useState(detail === "detailed");

  if (result.kind !== "analysis") {
    return (
      <div className="space-y-3 text-base leading-relaxed">
        <p>{result.message}</p>
        {result.kind === "clarification" && result.candidates.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {result.candidates.map((c) => (
              <button
                key={c.ticker}
                type="button"
                disabled={!onAsk}
                onClick={() => onAsk?.(`Analyse ${c.ticker}`)}
                className="hover:bg-accent rounded-full border px-3 py-1.5 text-left text-sm"
              >
                {c.name} ({c.ticker})
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  const two = result.stocks.length === 2;
  const showReasons = detail !== "brief";
  // Short answers offer "Why?" and "Explain more"; deeper answers offer only what is left.
  const chips = [...(detail === "brief" ? [WHY_CHIP, MORE_CHIP] : detail === "why" ? [MORE_CHIP] : []), ...result.explanation.followUps]
    .filter((q, i, all) => all.findIndex((x) => x.toLowerCase() === q.toLowerCase()) === i)
    .slice(0, 4);
  return (
    <div className="space-y-4">
      <p className="text-base leading-relaxed whitespace-pre-line">{result.explanation.answer}</p>

      {showReasons &&
        result.stocks.map((stock) => {
          const text = result.explanation.stocks.find((s) => s.ticker === stock.company.ticker);
          return text ? <ShortExplanation key={stock.company.ticker} text={text} showTicker={two} /> : null;
        })}

      {showReasons && result.explanation.comparison && <p className="text-base leading-relaxed">{result.explanation.comparison}</p>}

      <div className="space-y-2">
        {result.stocks.map((stock) => (
          <KeyFigures key={stock.company.ticker} stock={stock} />
        ))}
      </div>

      {result.notices.length > 0 && (
        <div className="text-muted-foreground space-y-1 text-xs">
          {result.notices.map((n) => (
            <p key={n} className="flex gap-1.5">
              <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              {n}
            </p>
          ))}
        </div>
      )}

      <div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm font-medium"
        >
          <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} aria-hidden />
          {open ? "Hide chart, news & sources" : "Show chart, news & sources"}
        </button>
        {open && (
          <div className="mt-4 space-y-8 rounded-2xl border p-4 sm:p-5">
            {result.stocks.map((stock) => (
              <Details
                key={stock.company.ticker}
                stock={stock}
                newsSummary={result.explanation.stocks.find((s) => s.ticker === stock.company.ticker)?.newsSummary}
              />
            ))}
            <p className="text-muted-foreground text-xs">
              Explanation: {result.explanationSource === "AI" ? "written by Gemini from verified data and checked by the app" : "rule-based summary generated by the app"}.
            </p>
          </div>
        )}
      </div>

      {onAsk && chips.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {chips.map((q) => (
            <button key={q} type="button" onClick={() => onAsk(q)} className="hover:bg-accent rounded-full border px-3 py-1.5 text-left text-sm">
              {q}
            </button>
          ))}
        </div>
      )}

      <p className="text-muted-foreground text-[11px] leading-snug">{result.disclaimer}</p>
    </div>
  );
}
