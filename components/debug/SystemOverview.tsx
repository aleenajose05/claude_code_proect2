import type { ServiceHealth } from "@/lib/health";
import type { RequestLog } from "@/lib/store/logger";
import { formatEt } from "@/lib/format";

function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="text-xl font-semibold tabular-nums">{value}</p>
      {note && <p className="text-muted-foreground text-[11px]">{note}</p>}
    </div>
  );
}

export function SystemOverview({ logs, lifetime, health }: { logs: RequestLog[]; lifetime: Record<string, number>; health: ServiceHealth[] }) {
  const ok = logs.filter((l) => l.status === "SUCCESS").length;
  const avg = logs.length ? Math.round(logs.reduce((s, l) => s + l.durationMs, 0) / logs.length) : null;
  const redis = health.find((h) => h.service === "Upstash Redis");
  const latestCheck = health.map((h) => h.checkedAt).sort().at(-1);
  const quotas = health.filter((h) => h.remainingQuota).map((h) => `${h.service}: ${h.remainingQuota}`);
  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-xs">Figures marked “last 20” are calculated only from the retained request logs.</p>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="Retained requests" value={String(logs.length)} note="last 20" />
        <Tile label="Successful" value={String(ok)} note="last 20" />
        <Tile label="Failed" value={String(logs.length - ok)} note="last 20" />
        <Tile label="Average duration" value={avg === null ? "—" : `${avg} ms`} note="last 20" />
        <Tile label="Lifetime requests" value={String(lifetime.total ?? 0)} note={`${lifetime.success ?? 0} ok · ${lifetime.failed ?? 0} failed (since counters started)`} />
        <Tile label="Latest health check" value={latestCheck ? formatEt(latestCheck) : "—"} />
        <Tile label="Cache" value={redis ? redis.status : "unknown"} note="Upstash Redis" />
        <Tile label="Quota info" value={quotas.length ? String(quotas.length) : "none"} note={quotas.join(" · ") || "No provider reported remaining quota"} />
      </div>
    </div>
  );
}
