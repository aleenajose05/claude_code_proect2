"use client";

import { Loader2, LogOut, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import type { ServiceHealth } from "@/lib/health";
import type { RequestLog } from "@/lib/store/logger";
import { Button } from "@/components/ui/button";
import { HealthCard } from "./HealthCard";
import { LogTable } from "./LogTable";
import { SystemOverview } from "./SystemOverview";

const REFRESH_MS = 60_000;

export function DebugDashboard() {
  const [health, setHealth] = useState<ServiceHealth[]>([]);
  const [healthCached, setHealthCached] = useState(false);
  const [logs, setLogs] = useState<RequestLog[]>([]);
  const [lifetime, setLifetime] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const load = useCallback(
    async (force = false) => {
      setLoading(true);
      setError(null);
      try {
        const [h, l] = await Promise.all([fetch(`/api/health${force ? "?refresh=1" : ""}`), fetch("/api/logs")]);
        if (h.status === 401 || l.status === 401) {
          router.replace("/debug/login");
          return;
        }
        if (h.ok) {
          const body = (await h.json()) as { services: ServiceHealth[]; cached: boolean };
          setHealth(body.services);
          setHealthCached(body.cached);
        } else setError(`Health check failed (HTTP ${h.status}).`);
        const logBody = (await l.json()) as { logs: RequestLog[]; lifetime: Record<string, number>; available: boolean };
        setLogs(logBody.logs);
        setLifetime(logBody.lifetime);
        if (!logBody.available) setError("Request logs are unavailable (Redis unreachable).");
      } catch {
        setError("Could not reach the server.");
      } finally {
        setLoading(false);
      }
    },
    [router],
  );

  useEffect(() => {
    // Initial fetch, then refresh every 60 seconds.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    const timer = setInterval(() => void load(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  async function logout() {
    await fetch("/api/auth/debug/logout", { method: "POST" }).catch(() => null);
    router.replace("/debug/login");
  }

  return (
    <main className="mx-auto w-full max-w-6xl space-y-8 px-4 py-6">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">StockLens AI · Debug dashboard</h1>
          <p className="text-muted-foreground text-xs">Auto-refreshes every 60 seconds. Health results are cached for 60 seconds to protect free-tier quotas.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void load(true)} disabled={loading}>
            {loading ? <Loader2 className="animate-spin" aria-hidden /> : <RefreshCw aria-hidden />} Re-run checks
          </Button>
          <Button variant="ghost" size="sm" onClick={logout}>
            <LogOut aria-hidden /> Log out
          </Button>
        </div>
      </header>
      {error && <p role="alert" className="border-destructive/40 bg-destructive/10 rounded-md border p-3 text-sm">{error}</p>}

      <section className="space-y-3">
        <h2 className="font-semibold">A. Live service health {healthCached && <span className="text-muted-foreground text-xs font-normal">(cached result)</span>}</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {health.map((h) => <HealthCard key={h.service} health={h} />)}
          {health.length === 0 && !loading && <p className="text-muted-foreground text-sm">No health data yet.</p>}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">B. Last 20 requests</h2>
        <LogTable logs={logs} />
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">C. System overview</h2>
        <SystemOverview logs={logs} lifetime={lifetime} health={health} />
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">D. Privacy</h2>
        <p className="text-muted-foreground text-sm">
          Only limited, redacted operational data is kept for debugging: the latest 20 requests with a redacted question preview (at most 100
          characters, omitted if it could not be safely redacted), tickers, timings, token counts and sanitised errors. Full questions, prompts,
          passwords, API keys and IP addresses are never stored. Questions are sent to Google Gemini; on its free tier Google may use them to improve
          its products, so do not type personal information.
        </p>
      </section>
    </main>
  );
}
