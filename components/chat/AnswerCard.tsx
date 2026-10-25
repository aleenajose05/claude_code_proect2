import { AlertTriangle, Info } from "lucide-react";

import type { StockAnalysis } from "@/lib/analysis/build";
import type { ChatResult } from "@/lib/chat/types";
import type { StockExplanation } from "@/lib/llm/schema";
import { FRESHNESS_TEXT, formatEt } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { NewsSentiment } from "@/components/stock/NewsSentiment";
import { PriceChart } from "@/components/stock/PriceChart";
import { StockSummary } from "@/components/stock/StockSummary";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2 border-t pt-4">
      <h4 className="text-sm font-semibold">{title}</h4>
      {children}
    </section>
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

function StockAnswer({ stock, text }: { stock: StockAnalysis; text: StockExplanation | undefined }) {
  return (
    <div className="space-y-4">
      <StockSummary stock={stock} />
      {stock.missing.length > 0 && (
        <ul className="space-y-1 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
          {stock.missing.map((m) => (
            <li key={m} className="flex gap-2">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              {m}
            </li>
          ))}
        </ul>
      )}
      {stock.history && stock.history.candles.length > 1 && (
        <PriceChart history={stock.history} direction={stock.direction.direction} ticker={stock.company.ticker} />
      )}
      {text && (
        <>
          <Section title="Why this direction?">
            <p className="text-sm">{text.directionExplanation}</p>
            <ol className="list-decimal space-y-1 pl-5 text-sm">
              {text.reasons.map((r) => <li key={r.text}>{r.text}</li>)}
            </ol>
          </Section>
          <Section title="Potential risks">
            <ol className="list-decimal space-y-1 pl-5 text-sm">
              {text.risks.map((r) => <li key={r.text}>{r.text}</li>)}
            </ol>
          </Section>
          <Section title="Recent news and sentiment">
            <p className="text-sm">{text.newsSummary}</p>
            <NewsSentiment news={stock.news} />
          </Section>
        </>
      )}
      <Section title="Financial data sources">
        <Sources stock={stock} />
      </Section>
    </div>
  );
}

export function AnswerCard({ result }: { result: ChatResult }) {
  if (result.kind !== "analysis") {
    const isError = result.kind === "error";
    return (
      <Card className="gap-3 py-4">
        <CardContent className="space-y-2 px-4 text-sm">
          <p className="flex gap-2">
            {isError ? <AlertTriangle className="text-destructive mt-0.5 size-4 shrink-0" aria-hidden /> : <Info className="mt-0.5 size-4 shrink-0" aria-hidden />}
            {result.message}
          </p>
          {result.kind === "clarification" && result.candidates.length > 0 && (
            <ul className="text-muted-foreground list-disc pl-6 text-xs">
              {result.candidates.map((c) => (
                <li key={c.ticker}>
                  {c.name} ({c.ticker}) · {c.type}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="gap-4 py-4 sm:py-6">
      <CardContent className="space-y-6 px-4 sm:px-6">
        {result.notices.map((n) => (
          <p key={n} className="bg-muted flex gap-2 rounded-md p-2 text-xs">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            {n}
          </p>
        ))}
        {result.stocks.map((stock, i) => (
          <div key={stock.company.ticker} className={i > 0 ? "border-t-2 pt-6" : undefined}>
            <StockAnswer stock={stock} text={result.explanation.stocks.find((s) => s.ticker === stock.company.ticker)} />
          </div>
        ))}
        {result.explanation.comparison && (
          <Section title="Comparison">
            <p className="text-sm">{result.explanation.comparison}</p>
          </Section>
        )}
        <p className="text-muted-foreground text-xs">
          Explanation: {result.explanationSource === "AI" ? "written by Gemini from verified data and checked by the app" : "rule-based summary generated by the app"}.
        </p>
        <p className="border-t pt-4 text-xs font-medium">{result.disclaimer}</p>
      </CardContent>
    </Card>
  );
}
