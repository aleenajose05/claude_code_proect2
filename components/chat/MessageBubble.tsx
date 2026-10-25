import { CheckCircle2, Loader2, RotateCcw, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";

import type { TraceStep } from "@/lib/chat/trace";
import type { ChatResult } from "@/lib/chat/types";
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

/** Shows the server's real processing steps while waiting; no invented progress. */
function Progress({ steps }: { steps: TraceStep[] }) {
  return (
    <div className="bg-muted/50 rounded-lg border p-3 text-xs" aria-live="polite">
      <p className="mb-1 flex items-center gap-2 font-medium">
        <Loader2 className="size-3.5 animate-spin" aria-hidden /> Working on it…
      </p>
      <ul className="space-y-0.5">
        {steps.slice(-6).map((s, i) => (
          <li key={`${s.at}-${i}`} className="text-muted-foreground flex items-center gap-1.5">
            {s.status === "error" ? <XCircle className="size-3" aria-hidden /> : <CheckCircle2 className="size-3" aria-hidden />}
            {s.name}
            {s.durationMs !== null ? ` · ${s.durationMs} ms` : ""}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function MessageBubble({ message, onRetry }: { message: Message; onRetry?: (question: string) => void }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <p className="bg-primary text-primary-foreground max-w-[85%] rounded-2xl rounded-br-sm px-4 py-2 text-sm break-words whitespace-pre-wrap">{message.text}</p>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {message.result ? (
        <AnswerCard result={message.result} />
      ) : message.error ? (
        <div role="alert" className="border-destructive/40 bg-destructive/10 space-y-2 rounded-lg border p-3 text-sm">
          <p>{message.error}</p>
          {onRetry && (
            <Button variant="outline" size="sm" onClick={() => onRetry(message.question)}>
              <RotateCcw aria-hidden /> Try again
            </Button>
          )}
        </div>
      ) : (
        <Progress steps={message.steps} />
      )}
      {message.requestId && <p className="text-muted-foreground text-[11px]">Request ID: {message.requestId}</p>}
    </div>
  );
}
