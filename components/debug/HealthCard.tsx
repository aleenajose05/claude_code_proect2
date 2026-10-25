import type { ServiceHealth } from "@/lib/health";
import { formatEt } from "@/lib/format";
import { cn } from "@/lib/utils";

const TONE = { HEALTHY: "text-up", DEGRADED: "text-amber-600 dark:text-amber-400", UNAVAILABLE: "text-down" } as const;

export function HealthCard({ health }: { health: ServiceHealth }) {
  return (
    <div className="space-y-1 rounded-lg border p-3 text-xs">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium">{health.service}</p>
        <span className={cn("font-semibold", TONE[health.status])}>{health.status}</span>
      </div>
      <p>Latency: {health.latencyMs === null ? "n/a" : `${health.latencyMs} ms`}</p>
      <p>Checked: {formatEt(health.checkedAt)}</p>
      <p>Last success: {health.lastSuccessAt ? formatEt(health.lastSuccessAt) : "none recorded"}</p>
      <p>Quota: {health.remainingQuota ?? "not reported by provider"}</p>
      {health.lastError && <p className="text-down break-words">Last error: {health.lastError}</p>}
    </div>
  );
}
