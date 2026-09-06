import { useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, Info, Wrench, X } from "lucide-react";
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
  const pending = conflicts.filter((conflict) => !conflict.resolved);
  const cleared = conflicts.filter((conflict) => conflict.resolved);
  const [showStartHere, setShowStartHere] = useState(true);

  return (
    <aside className="panel-surface overflow-hidden">
      <div className="border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Wrench className="size-4 text-success" />
          <h2 className="text-sm font-semibold">Maintenance requests</h2>
          <span className="num ml-auto rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-semibold text-warning">
            {pending.length} to review
          </span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">Choose a request to see the suggested work time and safety needs.</p>
      </div>

      <div className="divide-y divide-border">
        {showStartHere && (
          <div className="relative bg-success/7 px-4 py-3.5">
            <button onClick={() => setShowStartHere(false)} className="absolute right-2 top-2 rounded p-1 text-muted-foreground hover:bg-background hover:text-foreground" aria-label="Dismiss getting started guide"><X className="size-3.5" /></button>
            <div className="flex items-start gap-2 pr-5">
              <Info className="mt-0.5 size-4 shrink-0 text-success" />
              <div>
                <p className="text-xs font-semibold">Start here</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Select a maintenance request, review the suggested time, then accept, reject, or revise the prototype plan.</p>
                <Button variant="link" className="mt-1 h-auto px-0 text-xs text-success" onClick={onOpenGuide}>Show me how</Button>
              </div>
            </div>
          </div>
        )}
        {pending.map((conflict) => {
          const recommendation = recommendations.find((item) => item.conflictId === conflict.id);
          const active = selectedId === conflict.id;
          return (
            <button
              key={conflict.id}
              onClick={() => onSelect(conflict.id)}
              className={`w-full px-4 py-3 text-left transition-colors ${
                active ? "bg-success/8 shadow-[inset_3px_0_0_var(--success)]" : "hover:bg-accent/45"
              }`}
            >
              <div className="flex items-start gap-2">
                <AlertTriangle className={`mt-0.5 size-4 shrink-0 ${conflict.severity === "critical" ? "text-destructive" : "text-warning"}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold">Maintenance decision</span>
                    <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase ${conflict.severity === "critical" ? "bg-destructive/10 text-destructive" : "bg-warning/10 text-warning"}`}>
                      {conflict.severity}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{recommendation?.strategy ?? "Operating plan required"}</p>
                  <div className="num mt-2 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <Clock3 className="size-3" /> Ready for review
                  </div>
                </div>
              </div>
            </button>
          );
        })}
        {cleared.map((conflict) => (
          <div key={conflict.id} className="flex items-center gap-2 px-4 py-3 text-xs text-muted-foreground">
            <CheckCircle2 className="size-4 text-success" />
            <span>Maintenance decision recorded</span>
          </div>
        ))}
        {!conflicts.length && <p className="px-4 py-6 text-center text-xs text-muted-foreground">No maintenance requests need review.</p>}
      </div>
    </aside>
  );
}
