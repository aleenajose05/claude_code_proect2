"use client";

import { ArrowUp, CalendarRange, LogOut, Newspaper, Scale, SquarePen, TrendingUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { CONTEXT_STORAGE_KEY, EMPTY_CONTEXT, parseStoredContext, serializeContext } from "@/lib/chat/session-context";
import type { ChatStreamEvent, ConversationContext } from "@/lib/chat/types";
import { Button } from "@/components/ui/button";
import { BrandMark } from "./BrandMark";
import { MessageBubble, type Message } from "./MessageBubble";

const MAX_LENGTH = 500;

const SUGGESTIONS = [
  { icon: TrendingUp, question: "Is Tesla bullish or bearish?" },
  { icon: CalendarRange, question: "Where could Microsoft be in 60 days?" },
  { icon: Scale, question: "Compare NVIDIA with Apple" },
  { icon: Newspaper, question: "Latest news on Google" },
];

function greetingFor(hour: number): string {
  if (hour < 5) return "Good evening";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

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
  // Uses the visitor's own clock, so it is set after mount (the server cannot know it).
  const [greeting, setGreeting] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    // sessionStorage only exists in the browser, so it is read after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setContext(loadContext());
    setGreeting(greetingFor(new Date().getHours()));
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
      className="bg-card focus-within:border-ring/70 rounded-[1.4rem] border shadow-[0_1px_2px_rgba(30,25,15,0.04),0_10px_30px_-14px_rgba(30,25,15,0.18)] transition-colors"
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
        placeholder="How can I help with your stocks today?"
        className="placeholder:text-muted-foreground/80 block max-h-52 min-h-14 w-full resize-none bg-transparent px-4 pt-4 pb-1 text-[15px] leading-relaxed outline-none"
        disabled={busy}
      />
      <div className="flex items-center justify-between gap-2 px-3 pb-3">
        <span className="text-muted-foreground px-1 text-xs">
          {input.length > MAX_LENGTH - 100 ? `${input.length}/${MAX_LENGTH}` : "US-listed stocks · up to 2 per question"}
        </span>
        <button
          type="submit"
          disabled={busy || !input.trim()}
          aria-label="Send question"
          className="bg-brand text-brand-foreground grid size-8 place-items-center rounded-lg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-30"
        >
          <ArrowUp className="size-4" strokeWidth={2.5} aria-hidden />
        </button>
      </div>
    </form>
  );

  const empty = messages.length === 0;

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="bg-background/85 sticky top-0 z-10 backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-2 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <BrandMark />
            <h1 className="font-serif text-lg font-medium tracking-tight">StockLens</h1>
          </div>
          <div className="flex items-center gap-1">
            {!empty && (
              <Button variant="ghost" size="sm" onClick={clearConversation} disabled={busy} aria-label="New chat" className="text-muted-foreground">
                <SquarePen aria-hidden /> <span className="hidden sm:inline">New chat</span>
              </Button>
            )}
            {showLogout && (
              <Button variant="ghost" size="sm" onClick={logout} aria-label="Log out" className="text-muted-foreground">
                <LogOut aria-hidden /> <span className="hidden sm:inline">Log out</span>
              </Button>
            )}
          </div>
        </div>
      </header>

      {empty ? (
        <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-8 px-4 pb-20">
          <div className="animate-in fade-in slide-in-from-bottom-2 space-y-2 text-center duration-500">
            <h2 className="font-serif text-3xl font-normal tracking-tight sm:text-[2.6rem]">
              {greeting ? `${greeting}.` : "\u00a0"}
            </h2>
            <p className="text-muted-foreground text-[15px]">Ask about any US stock.</p>
          </div>
          {composer}
          <div className="flex flex-wrap justify-center gap-2">
            {SUGGESTIONS.map(({ icon: Icon, question }) => (
              <button
                key={question}
                type="button"
                onClick={() => void ask(question)}
                disabled={busy}
                className="bg-card/60 hover:bg-card text-muted-foreground hover:text-foreground inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition-colors"
              >
                <Icon className="text-brand size-4 shrink-0" aria-hidden />
                {question}
              </button>
            ))}
          </div>
          <p className="text-muted-foreground text-center text-xs">
            Real market data, every number calculated by the app. Not financial advice.
          </p>
        </main>
      ) : (
        <>
          <main className="mx-auto w-full max-w-3xl flex-1 space-y-10 px-4 pt-6 pb-10">
            {messages.map((m) => (
              <MessageBubble key={m.id} message={m} onRetry={busy ? undefined : (question) => void ask(question)} onAsk={busy ? undefined : (question) => void ask(question)} />
            ))}
            <div ref={endRef} />
          </main>
          <footer className="from-background via-background sticky bottom-0 bg-gradient-to-t from-60% to-transparent pt-6">
            <div className="mx-auto max-w-3xl px-4 pb-3">
              {composer}
              <p className="text-muted-foreground mt-2 text-center text-[11px]">StockLens can&apos;t predict exact prices. Not financial advice.</p>
            </div>
          </footer>
        </>
      )}
    </div>
  );
}
