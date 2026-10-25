"use client";

import { useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import type { Direction } from "@/lib/analysis/types";
import { formatChartDate, formatUsd } from "@/lib/format";
import type { PriceHistoryResult } from "@/lib/tools/schemas";
import { Button } from "@/components/ui/button";

const LINE_COLOR: Record<Direction, string> = {
  UP: "var(--up)",
  DOWN: "var(--down)",
  SIDEWAYS: "var(--sideways)",
  UNAVAILABLE: "var(--sideways)",
};

export function PriceChart({ history, direction, ticker }: { history: PriceHistoryResult; direction: Direction; ticker: string }) {
  const [showTable, setShowTable] = useState(false);
  const data = history.candles.map((c) => ({ date: c.date, close: c.close }));
  const closes = data.map((d) => d.close);
  const pad = (Math.max(...closes) - Math.min(...closes)) * 0.08 || 1;

  return (
    <figure className="space-y-2">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-medium">
          {ticker} daily close, last 90 calendar days {history.adjusted ? "(split/dividend adjusted)" : "(unadjusted)"}
        </span>
        <Button variant="ghost" size="sm" onClick={() => setShowTable((v) => !v)} aria-expanded={showTable}>
          {showTable ? "Hide data table" : "Show data table"}
        </Button>
      </figcaption>
      <div className="h-56 w-full sm:h-64" role="img" aria-label={`Line chart of ${ticker} daily closing prices over ${data.length} trading days`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="var(--border)" strokeDasharray="0" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={formatChartDate}
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              tickLine={false}
              axisLine={{ stroke: "var(--border)" }}
              minTickGap={32}
            />
            <YAxis
              domain={[Math.min(...closes) - pad, Math.max(...closes) + pad]}
              tickFormatter={(v: number) => `$${v.toFixed(0)}`}
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              tickLine={false}
              axisLine={false}
              width={48}
            />
            <Tooltip
              cursor={{ stroke: "var(--muted-foreground)", strokeWidth: 1 }}
              contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--popover-foreground)", fontSize: 12 }}
              labelFormatter={(label) => formatChartDate(String(label))}
              formatter={(value) => [formatUsd(Number(value)), "Close"]}
            />
            <Line type="monotone" dataKey="close" stroke={LINE_COLOR[direction]} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      {showTable && (
        <div className="max-h-64 overflow-auto rounded-md border">
          <table className="w-full text-left text-xs tabular-nums">
            <caption className="sr-only">{ticker} daily prices</caption>
            <thead className="bg-muted sticky top-0">
              <tr>
                {["Date", "Open", "High", "Low", "Close", "Volume"].map((h) => (
                  <th key={h} scope="col" className="px-2 py-1.5 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...history.candles].reverse().map((c) => (
                <tr key={c.date} className="border-t">
                  <td className="px-2 py-1">{c.date}</td>
                  <td className="px-2 py-1">{formatUsd(c.open)}</td>
                  <td className="px-2 py-1">{formatUsd(c.high)}</td>
                  <td className="px-2 py-1">{formatUsd(c.low)}</td>
                  <td className="px-2 py-1">{formatUsd(c.close)}</td>
                  <td className="px-2 py-1">{Math.round(c.volume).toLocaleString("en-US")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </figure>
  );
}
