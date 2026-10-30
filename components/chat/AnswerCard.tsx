"use client";

import { ChartLine, Check, Copy, Plus } from "lucide-react";
import { useState } from "react";

import type { StockAnalysis } from "@/lib/analysis/build";
import type { ChatResult } from "@/lib/chat/types";
import type { StockExplanation } from "@/lib/llm/schema";
import { FRESHNESS_TEXT, MARKET_STATUS_TEXT, formatEt, formatEtDate, formatSigned, formatUsd } from "@/lib/format";
import { DirectionBadge } from "@/components/stock/DirectionBadge";
import { NewsSentiment } from "@/components/stock/NewsSentiment";
import { PriceChart } from "@/components/stock/PriceChart";
import { StockSummary } from "@/components/stock/StockSummary";

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 px-4 py-3">
      <dt className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">{label}</dt>
      <dd className="mt-1 text-sm font-medium tabular-nums">{children}</dd>
    </div>
  );
}

/** The key numbers in one calm panel, so the answer itself stays conversational. */
function KeyFigures({ stock }: { stock: StockAnalysis }) {
  const { quote, company, confidence, direction } = stock;
  const range = stock.askedTarget?.range ?? stock.target;
  const rangeLabel = stock.askedTarget ? `Range · ${stock.askedTarget.horizon.label}` : "Range · ~20 days";
  const tone = !quote ? "" : quote.change > 0 ? "text-up" : quote.change < 0 ? "text-down" : "text-sideways";
  return (
    <div className="bg-card overflow-hidden rounded-2xl border">
      <div className="text-muted-foreground flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-b px-4 py-2 text-xs">
        <span>
          <span className="text-foreground font-semibold">{company.ticker}</span> · {company.companyName}
        </span>
        {quote && (
          <span>
            As of {quote.quoteTimeIsDateOnly ? formatEtDate(quote.quoteTime) : formatEt(quote.quoteTime)} · {MARKET_STATUS_TEXT[quote.marketStatus]}
          </span>
        )}
      </div>
      <dl className="divide-border grid grid-cols-2 divide-x divide-y sm:grid-cols-4 sm:divide-y-0 [&>*:nth-child(2n)]:max-sm:border-r-0">
        <Stat label="Price">
          {quote ? (
            <>
              {formatUsd(quote.price)} <span className={tone}>{formatSigned(quote.changePercent)}%</span>
            </>
          ) : (
            "Unavailable"
          )}
        </Stat>
        <Stat label="Trend">
          <DirectionBadge direction={direction.direction} className="px-1.5 py-0 text-xs" />
        </Stat>
        <Stat label={rangeLabel}>{range.available ? `${formatUsd(range.low)} – ${formatUsd(range.high)}` : "Unavailable"}</Stat>
        <Stat label="Confidence">{confidence.level}</Stat>
      </dl>
    </div>
  );
}

function ShortExplanation({ text, showTicker }: { text: StockExplanation; showTicker: boolean }) {
  return (
    <div className="space-y-4 font-serif text-[16.5px] leading-[1.7]">
      {showTicker && <p className="font-sans text-sm font-semibold">{text.ticker}</p>}
      <div>
        <p className="font-sans text-sm font-semibold">Why</p>
        <ul className="marker:text-muted-foreground mt-1.5 list-disc space-y-1.5 pl-5">
          {text.reasons.map((r) => (
            <li key={r.text}>{r.text}</li>
          ))}
        </ul>
      </div>
      <div>
        <p className="font-sans text-sm font-semibold">Risks to keep in mind</p>
        <ul className="marker:text-muted-foreground mt-1.5 list-disc space-y-1.5 pl-5">
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

function ActionButton({ onClick, label, pressed, children }: { onClick: () => void; label: string; pressed?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={pressed}
      className="hover:bg-accent hover:text-foreground inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors [&_svg]:size-4"
    >
      {children}
      {label}
    </button>
  );
}

export function AnswerCard({ result, onAsk, requestId }: { result: ChatResult; onAsk?: (question: string) => void; requestId?: string | null }) {
  const detail = result.kind === "analysis" ? result.intent.detail : "brief";
  const [copied, setCopied] = useState(false);
  const copy = () => {
    if (result.kind !== "analysis") return;
    navigator.clipboard
      ?.writeText(result.explanation.answer)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => setCopied(false));
  };
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
    <div className="animate-in fade-in slide-in-from-bottom-1 space-y-5 duration-500">
      <div className="space-y-3 font-serif text-[16.5px] leading-[1.7]">
        {result.explanation.answer
          .split(/\n\s*\n/)
          .map((paragraph) => paragraph.trim())
          .filter(Boolean)
          .map((paragraph, i) => (
            <p key={i}>{paragraph}</p>
          ))}
      </div>

      {showReasons &&
        result.stocks.map((stock) => {
          const text = result.explanation.stocks.find((s) => s.ticker === stock.company.ticker);
          return text ? <ShortExplanation key={stock.company.ticker} text={text} showTicker={two} /> : null;
        })}

      {showReasons && result.explanation.comparison && <p className="font-serif text-[16.5px] leading-[1.7]">{result.explanation.comparison}</p>}

      <div className="space-y-2">
        {result.stocks.map((stock) => (
          <KeyFigures key={stock.company.ticker} stock={stock} />
        ))}
      </div>

      {result.notices.map((n) => (
        <p key={n} className="text-muted-foreground text-sm">
          {n}
        </p>
      ))}

      <div className="text-muted-foreground -mt-1 -ml-2 flex items-center gap-0.5">
        <ActionButton onClick={() => setOpen((v) => !v)} pressed={open} label={open ? "Hide chart & sources" : "Chart & sources"}>
          <ChartLine aria-hidden />
        </ActionButton>
        <ActionButton onClick={copy} label={copied ? "Copied" : "Copy"}>
          {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
        </ActionButton>
      </div>

      {open && (
        <div className="bg-card animate-in fade-in space-y-8 rounded-2xl border p-4 duration-300 sm:p-6">
          {result.stocks.map((stock) => (
            <Details
              key={stock.company.ticker}
              stock={stock}
              newsSummary={result.explanation.stocks.find((s) => s.ticker === stock.company.ticker)?.newsSummary}
            />
          ))}
          <div className="text-muted-foreground space-y-1.5 border-t pt-4 text-xs">
            {result.technicalNotes.map((n) => (
              <p key={n}>{n}</p>
            ))}
            {result.technicalNotes.length === 0 && <p>Explanation written by Gemini from verified data and checked by the app.</p>}
            <p>{result.disclaimer}</p>
            {requestId && <p>Request ID: {requestId}</p>}
          </div>
        </div>
      )}

      {onAsk && chips.length > 0 && (
        <ul className="divide-y border-t pt-1">
          {chips.map((q) => (
            <li key={q}>
              <button
                type="button"
                onClick={() => onAsk(q)}
                className="text-muted-foreground hover:text-foreground group flex w-full items-center justify-between gap-3 py-2.5 text-left text-sm transition-colors"
              >
                {q}
                <Plus className="size-4 shrink-0 opacity-60 group-hover:opacity-100" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
