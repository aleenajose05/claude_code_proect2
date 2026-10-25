import { CheckCircle2, Loader2, XCircle } from "lucide-react";

import type { TraceStep } from "@/lib/chat/trace";
import type { ChatResult } from "@/lib/chat/types";
import { AnswerCard } from "./AnswerCard";

export type Message =
  | { id: string; role: "user"; text: string }
  | { id: string; role: "assistant"; steps: TraceStep[]; result: ChatResult | null; error: string | null; requestId: string | null };

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

export function MessageBubble({ message }: { message: Message }) {
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
        <p role="alert" className="border-destructive/40 bg-destructive/10 rounded-lg border p-3 text-sm">{message.error}</p>
      ) : (
        <Progress steps={message.steps} />
      )}
      {message.requestId && <p className="text-muted-foreground text-[11px]">Request ID: {message.requestId}</p>}
    </div>
  );
}
