import { ChevronDown, Code2 } from "lucide-react";
import type { OptimizationSchedule } from "@/lib/railblock/types";

export function DebugDrawer({
  open,
  onToggle,
  payload,
}: {
  open: boolean;
  onToggle: () => void;
  payload: OptimizationSchedule | null;
}) {
  return (
    <div className="sticky bottom-0 z-30 border-t border-border bg-panel/95 backdrop-blur">
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-5 py-2.5 text-left transition-colors hover:bg-accent/40"
      >
        <Code2 className="size-4 text-suburban" />
        <span className="num text-[11px] font-medium text-foreground/90">
          Technical details
        </span>
        <span className="rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-semibold text-success">For development</span>
        <span className="ml-auto text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          Raw data and diagnostics
        </span>
        <ChevronDown className={`size-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      <div
        className={`overflow-hidden transition-[max-height] duration-500 ease-out ${open ? "max-h-96" : "max-h-0"}`}
      >
        <pre className="num max-h-96 overflow-auto border-t border-border bg-background/80 px-5 py-4 text-[11px] leading-relaxed text-suburban/90">
          {JSON.stringify(payload, null, 2)}
        </pre>
      </div>
    </div>
  );
}
