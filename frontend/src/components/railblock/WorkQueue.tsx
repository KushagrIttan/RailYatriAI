import { useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, Info, ListChecks, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Conflict, ScheduleRecommendation } from "@/lib/railblock/types";

export function WorkQueue({
  conflicts,
  recommendations,
  selectedId,
  onSelect,
  onOpenGuide,
}: {
  conflicts: Conflict[];
  recommendations: ScheduleRecommendation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onOpenGuide: () => void;
}) {
  const pending = conflicts.filter((c) => !c.resolved);
  const cleared = conflicts.filter((c) => c.resolved);
  const [showBanner, setShowBanner] = useState(true);

  return (
    <div className="panel-surface overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-3.5">
        <ListChecks className="size-5 text-primary" />
        <h2 className="text-base font-semibold text-foreground tracking-tight">Work Queue</h2>
        {pending.length > 0 && (
          <span className="ml-auto rounded-full bg-orange-50 px-2 py-0.5 text-[11px] font-semibold text-warning">
            {pending.length} pending
          </span>
        )}
      </div>

      <div className="divide-y divide-border">
        {/* Onboarding tip */}
        {showBanner && (
          <div className="relative bg-blue-50/60 px-4 py-3">
            <button
              onClick={() => setShowBanner(false)}
              className="absolute right-2 top-2 rounded p-1 text-muted-foreground/60 hover:bg-white hover:text-foreground"
              aria-label="Dismiss"
            >
              <X className="size-3.5" />
            </button>
            <div className="flex items-start gap-2 pr-5">
              <Info className="mt-0.5 size-4 shrink-0 text-primary" />
              <div>
                <p className="text-xs font-medium text-foreground">Start here</p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                  Pick a request below, review the suggested time, then accept or reject.
                </p>
                <Button
                  variant="link"
                  className="mt-1 h-auto px-0 text-xs font-medium text-primary"
                  onClick={onOpenGuide}
                >
                  Show me how →
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Pending items */}
        {pending.map((conflict) => {
          const rec = recommendations.find((r) => r.conflictId === conflict.id);
          const active = selectedId === conflict.id;
          const critical = conflict.severity === "critical";
          return (
            <button
              key={conflict.id}
              onClick={() => onSelect(conflict.id)}
              className={`w-full px-4 py-3.5 text-left transition-colors ${
                active
                  ? "bg-accent shadow-[inset_3px_0_0_#2563eb]"
                  : "hover:bg-gray-50"
              }`}
            >
              <div className="flex items-start gap-2.5">
                <AlertTriangle
                  className={`mt-0.5 size-4 shrink-0 ${critical ? "text-destructive" : "text-warning"}`}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-foreground">Maintenance decision</span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                        critical
                          ? "bg-red-50 text-destructive"
                          : "bg-amber-50 text-warning"
                      }`}
                    >
                      {conflict.severity}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {rec?.strategy ?? "Operating plan required"}
                  </p>
                  <div className="mt-1.5 flex items-center gap-1 text-[10px] text-muted-foreground/60">
                    <Clock3 className="size-3" />
                    Ready for review
                  </div>
                </div>
              </div>
            </button>
          );
        })}

        {/* Cleared items */}
        {cleared.map((conflict) => (
          <div key={conflict.id} className="flex items-center gap-2.5 px-4 py-3 text-xs text-muted-foreground/60">
            <CheckCircle2 className="size-4 text-success" />
            Decision recorded
          </div>
        ))}

        {!conflicts.length && (
          <p className="px-4 py-8 text-center text-xs text-muted-foreground">
            No maintenance requests need review.
          </p>
        )}
      </div>
    </div>
  );
}
