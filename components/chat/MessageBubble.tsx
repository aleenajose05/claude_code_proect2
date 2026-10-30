import { LineChart, RotateCcw } from "lucide-react";

import type { TraceStep } from "@/lib/chat/trace";
import type { ChatResult } from "@/lib/chat/types";
import { Button } from "@/components/ui/button";
import { AnswerCard } from "./AnswerCard";

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
  return (
    <span className="bg-primary text-primary-foreground mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg" aria-hidden>
      <LineChart className="size-4" />
    </span>
  );
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
        <p className="bg-muted max-w-[85%] rounded-3xl px-4 py-2.5 text-base break-words whitespace-pre-wrap">{message.text}</p>
      </div>
    );
  }
  return (
    <div className="flex gap-3">
      <Avatar />
      <div className="min-w-0 flex-1 space-y-2">
        {message.result ? (
          <AnswerCard result={message.result} onAsk={onAsk} />
        ) : message.error ? (
          <div role="alert" className="space-y-2 text-base">
            <p>{message.error}</p>
            {onRetry && (
              <Button variant="outline" size="sm" onClick={() => onRetry(message.question)}>
                <RotateCcw aria-hidden /> Try again
              </Button>
            )}
          </div>
        ) : (
          <p className="text-muted-foreground animate-pulse pt-1 text-base" aria-live="polite">
            {progressLabel(message.steps)}
          </p>
        )}
        {message.requestId && <p className="text-muted-foreground/70 text-[11px]">Request ID: {message.requestId}</p>}
      </div>
    </div>
  );
}
