import { ExternalLink } from "lucide-react";

import { formatEt } from "@/lib/format";
import type { NewsSentimentResult } from "@/lib/tools/schemas";
import { cn } from "@/lib/utils";

const LABEL_TONE = { POSITIVE: "text-up", NEGATIVE: "text-down", NEUTRAL: "text-sideways" } as const;

export function NewsSentiment({ news }: { news: NewsSentimentResult | null }) {
  if (!news) return <p className="text-muted-foreground text-sm">Recent news is unavailable.</p>;
  if (news.items.length === 0) return <p className="text-muted-foreground text-sm">No recent articles in the last {news.windowDays} days.</p>;
  return (
    <div className="space-y-2">
      <p className="text-muted-foreground text-xs">
        Average sentiment: {news.averageSentiment === null ? "not used (fewer than 3 articles)" : news.averageSentiment.toFixed(2)} on a −1 to +1
        scale. Scores by {news.sentimentSource}, computed by the app.
      </p>
      <ul className="divide-y rounded-lg border">
        {news.items.map((item) => (
          <li key={item.id} className="flex flex-col gap-1 p-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <div className="min-w-0">
              <a href={item.url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-start gap-1 text-sm font-medium hover:underline">
                <span className="break-words">{item.headline}</span>
                <ExternalLink className="mt-0.5 size-3 shrink-0" aria-hidden />
                <span className="sr-only">(opens in a new tab)</span>
              </a>
              <p className="text-muted-foreground text-xs">
                {item.publisher} · {formatEt(item.publishedAt)}
              </p>
            </div>
            <span className={cn("shrink-0 text-xs font-semibold tabular-nums", LABEL_TONE[item.sentimentLabel])}>
              {item.sentimentLabel} {item.sentimentScore >= 0 ? "+" : "−"}
              {Math.abs(item.sentimentScore).toFixed(2)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
