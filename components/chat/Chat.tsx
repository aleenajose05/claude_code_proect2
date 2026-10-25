"use client";

import { LineChart, LogOut, Send, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import type { ChatStreamEvent, ConversationContext } from "@/lib/chat/types";
import { Button } from "@/components/ui/button";
import { MessageBubble, type Message } from "./MessageBubble";

const CONTEXT_KEY = "stocklens:context:v1";
const MAX_LENGTH = 500;
const EMPTY_CONTEXT: ConversationContext = { activeTicker: null, secondaryTicker: null };

const SUGGESTIONS = [
  "What is happening with Apple stock today?",
  "Analyse NVIDIA stock.",
  "Is Tesla looking bullish or bearish?",
  "Compare NVIDIA with Apple.",
  "What are the latest news and risks affecting Google stock?",
  "What is the calculated target range for AAPL?",
];

/** Browser-session context: ticker references only, never prices or credentials. */
function loadContext(): ConversationContext {
  try {
    const raw = sessionStorage.getItem(CONTEXT_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<ConversationContext>) : null;
    const ok = (t: unknown) => (typeof t === "string" && /^[A-Z]{1,5}(\.[A-Z])?$/.test(t) ? t : null);
    return parsed ? { activeTicker: ok(parsed.activeTicker), secondaryTicker: ok(parsed.secondaryTicker) } : EMPTY_CONTEXT;
  } catch {
    return EMPTY_CONTEXT;
  }
}

function saveContext(context: ConversationContext) {
  try {
    sessionStorage.setItem(CONTEXT_KEY, JSON.stringify(context));
  } catch {
    // Storage can be unavailable (private mode); follow-ups then just need the company name.
  }
}

let counter = 0;
const newId = () => `m${Date.now()}-${counter++}`;

export function Chat({ showLogout }: { showLogout: boolean }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [context, setContext] = useState<ConversationContext>(EMPTY_CONTEXT);
  const endRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    // sessionStorage only exists in the browser, so it is read after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setContext(loadContext());
  }, []);
  // Braces matter: scrollIntoView returns a Promise in newer browsers, and an effect may only return a cleanup function.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  const updateAssistant = (id: string, patch: Partial<Extract<Message, { role: "assistant" }>>) =>
    setMessages((all) => all.map((m) => (m.id === id && m.role === "assistant" ? { ...m, ...patch } : m)));

  async function ask(question: string) {
    const text = question.trim();
    if (!text || busy) return;
    const assistantId = newId();
    setMessages((all) => [
      ...all,
      { id: newId(), role: "user", text },
      { id: assistantId, role: "assistant", steps: [], result: null, error: null, requestId: null },
    ]);
    setInput("");
    setBusy(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text, context }),
      });
      if (response.status === 401) {
        router.replace("/demo/login");
        return;
      }
      if (!response.ok || !response.body) {
        const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
        updateAssistant(assistantId, { error: body?.error?.message ?? `Request failed (HTTP ${response.status}).` });
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let gotResult = false;
      for (;;) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as ChatStreamEvent;
          if (event.type === "step") {
            setMessages((all) =>
              all.map((m) => (m.id === assistantId && m.role === "assistant" ? { ...m, steps: [...m.steps, event.step] } : m)),
            );
          } else {
            gotResult = true;
            updateAssistant(assistantId, { result: event.result, requestId: event.requestId });
            setContext(event.result.context);
            saveContext(event.result.context);
          }
        }
        if (done) break;
      }
      if (!gotResult) updateAssistant(assistantId, { error: "The connection closed before the analysis finished. Please try again." });
    } catch {
      updateAssistant(assistantId, { error: "Could not reach the server. Check your connection and try again." });
    } finally {
      setBusy(false);
    }
  }

  function clearConversation() {
    setMessages([]);
    setContext(EMPTY_CONTEXT);
    saveContext(EMPTY_CONTEXT);
  }

  async function logout() {
    await fetch("/api/auth/demo/logout", { method: "POST" }).catch(() => null);
    router.replace("/demo/login");
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="bg-background/95 sticky top-0 z-10 border-b backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-2 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <LineChart className="size-6 shrink-0" aria-hidden />
            <div className="min-w-0">
              <h1 className="text-base leading-tight font-semibold">StockLens AI</h1>
              <p className="text-muted-foreground hidden truncate text-xs sm:block">Understand US stocks through simple, data-backed AI analysis.</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {context.activeTicker && (
              <span className="text-muted-foreground hidden text-xs sm:inline" title="Stocks the next follow-up question refers to">
                Discussing: {context.activeTicker}
                {context.secondaryTicker ? `, ${context.secondaryTicker}` : ""}
              </span>
            )}
            <Button variant="ghost" size="sm" onClick={clearConversation} disabled={busy || messages.length === 0} aria-label="Clear conversation">
              <Trash2 aria-hidden /> <span className="hidden sm:inline">Clear</span>
            </Button>
            {showLogout && (
              <Button variant="ghost" size="sm" onClick={logout} aria-label="Log out">
                <LogOut aria-hidden /> <span className="hidden sm:inline">Log out</span>
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 space-y-4 px-4 py-6">
        {messages.length === 0 && (
          <section className="space-y-4 py-6">
            <div className="space-y-1">
              <h2 className="text-2xl font-semibold">Ask about a US stock</h2>
              <p className="text-muted-foreground text-sm">
                Prices, history and news come from market-data providers. All numbers are calculated by the app; Gemini only explains them. Up to two
                stocks per question.
              </p>
              <p className="text-muted-foreground text-xs">
                Questions are sent to Google Gemini, and a short redacted preview is kept in the debug log. Please don&apos;t type personal information.
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {SUGGESTIONS.map((s) => (
                <Button key={s} variant="outline" className="h-auto justify-start py-2 text-left whitespace-normal" onClick={() => ask(s)} disabled={busy}>
                  {s}
                </Button>
              ))}
            </div>
          </section>
        )}
        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}
        <div ref={endRef} />
      </main>

      <footer className="bg-background sticky bottom-0 border-t">
        <form
          className="mx-auto flex max-w-3xl items-end gap-2 px-4 py-3"
          onSubmit={(e) => {
            e.preventDefault();
            void ask(input);
          }}
        >
          <label htmlFor="question" className="sr-only">
            Your question
          </label>
          <div className="flex-1">
            <textarea
              id="question"
              value={input}
              onChange={(e) => setInput(e.target.value.slice(0, MAX_LENGTH))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void ask(input);
                }
              }}
              rows={1}
              maxLength={MAX_LENGTH}
              placeholder="e.g. Analyse Microsoft using its last 90 days"
              className="border-input placeholder:text-muted-foreground focus-visible:ring-ring/50 max-h-40 min-h-10 w-full resize-y rounded-md border bg-transparent px-3 py-2 text-base outline-none focus-visible:ring-[3px] md:text-sm"
              disabled={busy}
            />
            <p className="text-muted-foreground text-right text-[11px]">
              {input.length}/{MAX_LENGTH}
            </p>
          </div>
          <Button type="submit" disabled={busy || !input.trim()} className="mb-5" aria-label="Send question">
            <Send aria-hidden /> <span className="hidden sm:inline">Send</span>
          </Button>
        </form>
      </footer>
    </div>
  );
}
