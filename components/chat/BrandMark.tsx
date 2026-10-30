import { LineChart } from "lucide-react";

import { cn } from "@/lib/utils";

/** The app's mark: a chart line on the teal brand tile. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span className={cn("bg-brand text-brand-foreground grid size-7 shrink-0 place-items-center rounded-lg [&_svg]:size-4", className)} aria-hidden>
      <LineChart strokeWidth={2.25} />
    </span>
  );
}
