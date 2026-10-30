"use client";

import { ArrowUp, LineChart, LogOut, SquarePen } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { CONTEXT_STORAGE_KEY, EMPTY_CONTEXT, parseStoredContext, serializeContext } from "@/lib/chat/session-context";
import type { ChatStreamEvent, ConversationContext } from "@/lib/chat/types";
import { Button } from "@/components/ui/button";
import { MessageBubble, type Message } from "./MessageBubble";

const MAX_LENGTH = 500;

const SUGGESTIONS = [
  "What is happening with Apple stock today?",
  "Analyse NVIDIA stock.",
  "Is Tesla looking bullish or bearish?",
  "Compare NVIDIA with Apple.",
  "What are the latest news and risks affecting Google stock?",
  "Where could Microsoft stock be in 60 days?",
];

function loadContext(): ConversationContext {
  try {
    return parseStoredContext(sessionStorage.getItem(CONTEXT_STORAGE_KEY));
  } catch {
    return EMPTY_CONTEXT;
  }
}

function saveContext(context: ConversationContext) {
  try {
    sessionStorage.setItem(CONTEXT_STORAGE_KEY, serializeContext(context));
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
      { id: assistantId, role: "assistant", question: text, steps: [], result: null, error: null, requestId: null },
    ]);
    setInput("");
    setBusy(true);

    let connected = false;
    let lastStep: string | null = null;
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

      connected = true;
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
            lastStep = event.step.name;
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
      if (!gotResult) throw new Error("stream ended without a result");
    } catch {
      updateAssistant(assistantId, {
        error: connected
          ? `The connection was interrupted while the answer was being prepared${lastStep ? ` (last step: ${lastStep})` : ""}. This can happen while a new version is being deployed or if the server ran out of time. Please try again.`
          : "Could not reach the server. Check your internet connection and try again.",
      });
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

  const composer = (
    <form
      className="bg-background focus-within:ring-ring/40 relative flex items-end gap-2 rounded-3xl border p-2 pl-4 shadow-sm focus-within:ring-[3px]"
      onSubmit={(e) => {
        e.preventDefault();
        void ask(input);
      }}
    >
      <label htmlFor="question" className="sr-only">
        Ask about a US stock
      </label>
      <textarea
        id="question"
        value={input}
        onChange={(e) => {
          setInput(e.target.value.slice(0, MAX_LENGTH));
          // Grow with the text, up to the CSS max height.
          e.target.style.height = "auto";
          e.target.style.height = `${e.target.scrollHeight}px`;
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void ask(input);
          }
        }}
        rows={1}
        maxLength={MAX_LENGTH}
        placeholder="Ask about any US stock…"
        className="placeholder:text-muted-foreground max-h-48 min-h-10 flex-1 resize-none bg-transparent py-2 text-base outline-none"
        disabled={busy}
      />
      {input.length > MAX_LENGTH - 100 && (
        <span className="text-muted-foreground self-center text-[11px] tabular-nums">
          {input.length}/{MAX_LENGTH}
        </span>
      )}
      <Button type="submit" size="icon" className="size-10 shrink-0 rounded-full" disabled={busy || !input.trim()} aria-label="Send question">
        <ArrowUp aria-hidden />
      </Button>
    </form>
  );

  const empty = messages.length === 0;

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="bg-background/90 sticky top-0 z-10 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-2 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <span className="bg-primary text-primary-foreground grid size-7 place-items-center rounded-lg">
              <LineChart className="size-4" aria-hidden />
            </span>
            <h1 className="text-base font-semibold">StockLens AI</h1>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={clearConversation} disabled={busy || empty} aria-label="New chat">
              <SquarePen aria-hidden /> <span className="hidden sm:inline">New chat</span>
            </Button>
            {showLogout && (
              <Button variant="ghost" size="sm" onClick={logout} aria-label="Log out">
                <LogOut aria-hidden /> <span className="hidden sm:inline">Log out</span>
              </Button>
            )}
          </div>
        </div>
      </header>

      {empty ? (
        <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-6 px-4 pb-16">
          <div className="space-y-2 text-center">
            <h2 className="text-2xl font-semibold sm:text-3xl">What would you like to know?</h2>
            <p className="text-muted-foreground text-sm">Ask about any US-listed stock. Answers use real market data; all numbers are calculated by the app.</p>
          </div>
          {composer}
          <div className="flex flex-wrap justify-center gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => void ask(s)}
                disabled={busy}
                className="hover:bg-accent text-muted-foreground hover:text-foreground rounded-full border px-3 py-1.5 text-left text-sm transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
          <p className="text-muted-foreground text-center text-xs">
            Questions are sent to Google Gemini. Please don&apos;t type personal information.
          </p>
        </main>
      ) : (
        <>
          <main className="mx-auto w-full max-w-3xl flex-1 space-y-8 px-4 py-6">
            {messages.map((m) => (
              <MessageBubble key={m.id} message={m} onRetry={busy ? undefined : (question) => void ask(question)} onAsk={busy ? undefined : (question) => void ask(question)} />
            ))}
            <div ref={endRef} />
          </main>
          <footer className="bg-background sticky bottom-0">
            <div className="mx-auto max-w-3xl px-4 pt-2 pb-3">
              {composer}
              <p className="text-muted-foreground mt-2 text-center text-[11px]">
                StockLens AI can&apos;t predict exact prices. Not financial advice.
              </p>
            </div>
          </footer>
        </>
      )}
    </div>
  );
}
