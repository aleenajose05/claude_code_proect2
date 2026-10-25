"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import { Fragment, useState } from "react";

import type { RequestLog } from "@/lib/store/logger";
import { formatEt } from "@/lib/format";
import { cn } from "@/lib/utils";

export function LogTable({ logs }: { logs: RequestLog[] }) {
  const [open, setOpen] = useState<string | null>(null);
  if (logs.length === 0) return <p className="text-muted-foreground text-sm">No requests recorded yet.</p>;
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[720px] text-left text-xs">
        <thead className="bg-muted">
          <tr>
            {["", "Time", "Request ID", "Ticker", "Question (redacted)", "Model", "Tokens", "Duration", "Cache", "Validation", "Status"].map((h) => (
              <th key={h} scope="col" className="px-2 py-2 font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {logs.map((log) => {
            const expanded = open === log.requestId;
            return (
              <Fragment key={log.requestId}>
                <tr className="border-t align-top">
                  <td className="px-2 py-2">
                    <button
                      type="button"
                      onClick={() => setOpen(expanded ? null : log.requestId)}
                      aria-expanded={expanded}
                      aria-label={expanded ? "Hide steps" : "Show steps"}
                      className="hover:bg-accent rounded p-0.5"
                    >
                      {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                    </button>
                  </td>
                  <td className="px-2 py-2 whitespace-nowrap">{formatEt(log.timestamp)}</td>
                  <td className="px-2 py-2 font-mono">{log.requestId}</td>
                  <td className="px-2 py-2">{log.tickers.join(", ") || "—"}</td>
                  <td className="max-w-56 px-2 py-2 break-words">{log.questionPreview ?? <em className="text-muted-foreground">omitted</em>}</td>
                  <td className="px-2 py-2">{log.model ?? "—"}</td>
                  <td className="px-2 py-2 tabular-nums">{log.tokens ? log.tokens.total : "not reported"}</td>
                  <td className="px-2 py-2 tabular-nums">{log.durationMs} ms</td>
                  <td className="px-2 py-2 whitespace-nowrap">{log.cache.hits} hit / {log.cache.misses} miss</td>
                  <td className="px-2 py-2">{log.validation}</td>
                  <td className={cn("px-2 py-2 font-semibold", log.status === "SUCCESS" ? "text-up" : "text-down")}>
                    {log.status} ({log.httpStatus}, {log.resultKind})
                  </td>
                </tr>
                {expanded && (
                  <tr className="bg-muted/40">
                    <td />
                    <td colSpan={10} className="px-2 py-3">
                      {log.error && <p className="text-down mb-2">Error: {log.error}</p>}
                      <p className="mb-1 font-medium">Tool durations: {Object.entries(log.toolDurations).map(([k, v]) => `${k} ${v} ms`).join(" · ") || "none"}</p>
                      <ol className="list-decimal space-y-0.5 pl-5">
                        {log.steps.map((s, i) => (
                          <li key={i}>
                            <span className="font-mono">{new Date(s.at).toISOString().slice(11, 23)}</span> {s.name}
                            {s.durationMs !== null ? ` (${s.durationMs} ms)` : ""}
                            {s.status === "error" ? " · error" : ""}
                            {s.detail ? ` · ${s.detail}` : ""}
                          </li>
                        ))}
                      </ol>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
