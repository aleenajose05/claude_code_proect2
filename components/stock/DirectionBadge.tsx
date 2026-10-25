import { ArrowRight, TrendingDown, TrendingUp, HelpCircle } from "lucide-react";

import type { Direction } from "@/lib/analysis/types";
import { cn } from "@/lib/utils";

const STYLE: Record<Direction, { icon: typeof TrendingUp; className: string; label: string }> = {
  UP: { icon: TrendingUp, className: "text-up border-up/40 bg-up/10", label: "UP" },
  DOWN: { icon: TrendingDown, className: "text-down border-down/40 bg-down/10", label: "DOWN" },
  SIDEWAYS: { icon: ArrowRight, className: "text-sideways border-sideways/40 bg-sideways/10", label: "SIDEWAYS" },
  UNAVAILABLE: { icon: HelpCircle, className: "text-muted-foreground border-border", label: "UNAVAILABLE" },
};

/** Direction is always shown as text plus an icon, so colour is never the only signal. */
export function DirectionBadge({ direction, className }: { direction: Direction; className?: string }) {
  const { icon: Icon, className: tone, label } = STYLE[direction];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-sm font-semibold", tone, className)}>
      <Icon className="size-4" aria-hidden />
      {label}
    </span>
  );
}
