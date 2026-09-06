import { useState } from "react";
import { AlertOctagon, CheckCircle2, CircuitBoard, FlaskConical, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Conflict, ScheduleRecommendation } from "@/lib/railblock/types";

export function DecisionPanel({
  conflict,
  recommendation,
  approving,
  onApprove,
  onReject,
  onOverride,
  onSimulate,
  simulation,
}: {
  conflict: Conflict | null;
  recommendation: ScheduleRecommendation | null;
  approving: "idle" | "working" | "done";
  onApprove: () => void;
  onOverride: () => void;
  onSimulate: () => void;
  onReject: (reason: string) => void;
  simulation: string | null;
}) {
  const [expanded, setExpanded] = useState(true);
  const [rejectMode, setRejectMode] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  if (!conflict || !recommendation) {
    return (
      <div className="panel-surface flex flex-col items-center justify-center gap-2.5 px-5 py-12 text-center">
        <ShieldCheck className="size-8 text-success" />
        <p className="text-sm font-medium">All requests reviewed</p>
        <p className="text-xs text-muted-foreground">
          No maintenance requests need a decision in this saved scenario.
        </p>
      </div>
    );
  }

  const critical = conflict.severity === "critical";

  return (
    <div className="space-y-3">
      {/* Conflict card */}
      <div className="panel-surface px-5 py-4">
        <div className="flex items-start gap-2.5">
          <AlertOctagon
            className={`mt-0.5 size-4 shrink-0 ${critical ? "animate-led text-destructive" : "text-warning"}`}
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold">Maintenance request</span>
              <span
                className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase ${
                  critical ? "bg-red-50 text-destructive" : "bg-amber-50 text-warning"
                }`}
              >
                {conflict.severity}
              </span>
              <span className="ml-auto text-[10px] text-muted-foreground/60">Saved scenario</span>
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              How this work fits around scheduled trains
            </p>
            <p className="mt-2 text-xs leading-relaxed text-foreground/80">{conflict.description}</p>
          </div>
        </div>
      </div>

      {/* Recommendation card */}
      <div className="panel-surface px-5 py-4">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex w-full items-center gap-2 text-left"
        >
          <CircuitBoard className="size-4 text-primary" />
          <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Suggested plan
          </span>
          <span className="ml-auto rounded-full bg-green-50 px-2.5 py-0.5 text-[10px] font-semibold text-success">
            {(recommendation.confidence * 100).toFixed(0)}% confidence
          </span>
        </button>

        <p className="mt-2 text-sm font-medium text-foreground">{recommendation.strategy}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Based on a gap in the saved timetable and safety requirements.
        </p>

        {/* Confidence bar */}
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
          <div
            className="h-full rounded-full bg-success transition-all duration-700"
            style={{ width: `${recommendation.confidence * 100}%` }}
          />
        </div>

        {/* Metrics row */}
        <div className="mt-4 grid grid-cols-3 gap-2">
          <Metric label="Delay avoided" value={`${recommendation.delaySavedMinutes.toFixed(1)}m`} tone="text-success" />
          <Metric label="Timetable space" value={`+${recommendation.throughputDeltaPct.toFixed(1)}%`} tone="text-primary" />
          <Metric label="Planning time" value={`${recommendation.computeMs}ms`} tone="text-muted-foreground" />
        </div>

        {/* Steps */}
        {expanded && (
          <ol className="mt-4 space-y-2 border-l-2 border-border pl-4">
            {recommendation.steps.map((s, i) => (
              <li key={i} className="relative">
                <span className="absolute -left-[1.2rem] top-1.5 size-2 rounded-full bg-primary/30" />
                <p className="num text-xs font-semibold">
                  {s.trainNumber} — <span className="font-normal text-foreground/80">{s.action}</span>
                </p>
                <p className="text-[11px] text-muted-foreground">{s.detail}</p>
              </li>
            ))}
          </ol>
        )}

        {/* Simulation result */}
        {simulation && (
          <div className="mt-4 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3">
            <p className="num text-xs text-sky-700">{simulation}</p>
          </div>
        )}

        {/* Actions */}
        {rejectMode ? (
          <div className="mt-4 flex flex-col gap-2 rounded-lg border border-red-200 bg-red-50 p-4">
            <input
              type="text"
              placeholder="Why does this suggested time not work?"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <div className="flex gap-2">
              <Button
                onClick={() => { onReject(rejectReason); setRejectMode(false); setRejectReason(""); }}
                disabled={!rejectReason.trim()}
                className="bg-destructive text-white hover:bg-destructive/90"
              >
                Record rejection
              </Button>
              <Button variant="ghost" onClick={() => setRejectMode(false)} className="text-muted-foreground">
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              onClick={onApprove}
              disabled={approving !== "idle"}
              className="relative flex-1 overflow-hidden bg-success text-white hover:bg-success/90"
            >
              {approving === "working" && (
                <span className="animate-sweep absolute inset-y-0 w-1/3 bg-white/20" />
              )}
              {approving === "done" ? (
                <><CheckCircle2 className="size-4" /> Plan Applied</>
              ) : approving === "working" ? (
                "Recording…"
              ) : (
                "Accept plan"
              )}
            </Button>
            <Button
              variant="outline"
              onClick={() => setRejectMode(true)}
              className="border-red-200 text-destructive hover:bg-red-50"
            >
              Reject
            </Button>
            <Button
              variant="outline"
              onClick={onOverride}
              className="border-amber-200 text-warning hover:bg-amber-50"
            >
              <SlidersHorizontal className="size-4" /> Adjust
            </Button>
            <Button variant="ghost" onClick={onSimulate} className="text-muted-foreground">
              <FlaskConical className="size-4" /> Check impact
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-lg bg-gray-50 px-3 py-2">
      <div className="text-[9px] uppercase tracking-wide text-muted-foreground/60">{label}</div>
      <div className={`num text-sm font-semibold ${tone}`}>{value}</div>
    </div>
  );
}
