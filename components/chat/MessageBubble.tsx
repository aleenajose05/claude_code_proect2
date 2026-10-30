import { RotateCcw } from "lucide-react";

import type { TraceStep } from "@/lib/chat/trace";
import type { ChatResult } from "@/lib/chat/types";
import { Button } from "@/components/ui/button";
import { AnswerCard } from "./AnswerCard";
import { BrandMark } from "./BrandMark";

export type Message =
  | { id: string; role: "user"; text: string }
  | {
      id: string;
      role: "assistant";
      /** The question this answers, so a failed request can be retried. */
      question: string;
      steps: TraceStep[];
      result: ChatResult | null;
      error: string | null;
      requestId: string | null;
    };

/** Friendly wording for the server's real progress steps (no invented progress). */
function progressLabel(steps: TraceStep[]): string {
  const name = steps.at(-1)?.name ?? "";
  if (/explanation|validated|Final Gemini/i.test(name)) return "Writing the answer…";
  if (/Quote|Price history|News|metrics/i.test(name)) return "Fetching market data…";
  if (/Ticker|resolve/i.test(name)) return "Finding the stock…";
  return "Thinking…";
}

function Avatar() {
  return <BrandMark className="mt-1 size-6 rounded-md [&_svg]:size-3.5" />;
}

export function MessageBubble({
  message,
  onRetry,
  onAsk,
}: {
  message: Message;
  onRetry?: (question: string) => void;
  onAsk?: (question: string) => void;
}) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <p className="bg-secondary max-w-[85%] rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed break-words whitespace-pre-wrap">{message.text}</p>
      </div>
    );
  }
  return (
    <div className="flex gap-3">
      <Avatar />
      <div className="min-w-0 flex-1 space-y-2">
        {message.result ? (
          <AnswerCard result={message.result} onAsk={onAsk} requestId={message.requestId} />
        ) : message.error ? (
          <div role="alert" className="space-y-3 font-serif text-[16.5px] leading-[1.7]">
            <p>{message.error}</p>
            {onRetry && (
              <Button variant="outline" size="sm" onClick={() => onRetry(message.question)}>
                <RotateCcw aria-hidden /> Try again
              </Button>
            )}
          </div>
        ) : (
          <p className="text-muted-foreground flex items-center gap-2.5 pt-1 text-[15px]" aria-live="polite">
            <span className="bg-brand size-2 animate-pulse rounded-full" aria-hidden />
            {progressLabel(message.steps)}
          </p>
        )}
        {message.error && message.requestId && <p className="text-muted-foreground/70 text-[11px]">Request ID: {message.requestId}</p>}
      </div>
    </div>
  );
}
