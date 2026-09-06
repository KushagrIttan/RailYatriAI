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
      <div className="panel-surface flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
        <ShieldCheck className="size-8 text-success" />
        <p className="text-sm font-medium">All maintenance requests reviewed</p>
        <p className="text-xs text-muted-foreground">
          No maintenance requests need a decision in this saved scenario.
        </p>
      </div>
    );
  }

  const critical = conflict.severity === "critical";

  return (
    <div className="space-y-3">
      <div
        className={`panel-surface relative overflow-hidden px-4 py-3 ${
          critical ? "border-destructive/50" : "border-warning/50"
        }`}
      >
        <div
          className={`absolute inset-x-0 top-0 h-px ${critical ? "bg-destructive" : "bg-warning"}`}
        />
        <div className="flex items-start gap-2">
          <AlertOctagon className={`mt-0.5 size-4 ${critical ? "animate-led text-destructive" : "text-warning"}`} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold">Maintenance request</span>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                  critical
                    ? "bg-destructive/15 text-destructive"
                    : "bg-warning/15 text-warning"
                }`}
              >
                {conflict.severity}
              </span>
              <span className="ml-auto text-[10px] text-muted-foreground">Saved scenario</span>
            </div>
            <p className="num mt-1 text-xs text-foreground/90">
              How this work fits around scheduled trains
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{conflict.description}</p>
          </div>
        </div>
      </div>

      <div className="panel-surface px-4 py-3">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex w-full items-center gap-2 text-left"
        >
          <CircuitBoard className="size-4 text-success" />
          <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            Suggested plan
          </span>
          <span className="num ml-auto rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-semibold text-success">
            Confidence: {(recommendation.confidence * 100).toFixed(0)}%
          </span>
        </button>

        <p className="mt-2 text-sm font-medium">{recommendation.strategy}</p>
        <p className="mt-1 text-xs text-muted-foreground">This suggestion uses a gap in the saved timetable and the work's safety requirements.</p>

        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-success transition-all duration-1000 ease-out"
            style={{ width: `${recommendation.confidence * 100}%` }}
          />
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          <Metric label="Estimated delay avoided" value={`${recommendation.delaySavedMinutes.toFixed(1)}m`} tone="text-success" />
          <Metric label="Extra timetable space" value={`+${recommendation.throughputDeltaPct.toFixed(1)}%`} tone="text-suburban" />
          <Metric label="Planning time" value={`${recommendation.computeMs}ms`} tone="text-muted-foreground" />
        </div>

        {expanded && (
          <ol className="mt-3 space-y-2 border-l border-border pl-3">
            {recommendation.steps.map((s, i) => (
              <li key={i} className="relative">
                <span className="absolute -left-[1.05rem] top-1.5 size-1.5 rounded-full bg-success" />
                <p className="num text-xs font-semibold">
                  {s.trainNumber} — <span className="font-normal text-foreground/85">{s.action}</span>
                </p>
                <p className="text-[11px] text-muted-foreground">{s.detail}</p>
              </li>
            ))}
          </ol>
        )}

        {simulation && (
          <div className="mt-3 rounded-md border border-suburban/40 bg-suburban/10 px-3 py-2">
            <p className="num text-[11px] text-suburban">{simulation}</p>
          </div>
        )}

        {rejectMode ? (
          <div className="mt-4 flex w-full flex-col gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3">
            <input
              type="text"
              placeholder="Why does this suggested time not work?"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-destructive"
            />
            <div className="flex gap-2">
              <Button
                onClick={() => {
                  onReject(rejectReason);
                  setRejectMode(false);
                  setRejectReason("");
                }}
                disabled={!rejectReason.trim()}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
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
              className="relative flex-1 overflow-hidden bg-success text-success-foreground hover:bg-success/90"
            >
              {approving === "working" && (
                <span className="animate-sweep absolute inset-y-0 w-1/3 bg-white/20" />
              )}
              {approving === "done" ? (
                <>
                  <CheckCircle2 className="size-4" /> Plan Applied
                </>
              ) : approving === "working" ? (
                "Recording…"
              ) : (
                "Accept suggested plan"
              )}
            </Button>
            <Button variant="outline" onClick={() => setRejectMode(true)} className="border-destructive/50 text-destructive hover:bg-destructive/10">
              Reject suggestion
            </Button>
            <Button variant="outline" onClick={onOverride} className="border-warning/50 text-warning hover:bg-warning/10">
              <SlidersHorizontal className="size-4" /> Adjust manually
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
    <div className="rounded-md border border-border bg-background/50 px-2 py-1.5">
      <div className="text-[9px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`num text-sm font-semibold ${tone}`}>{value}</div>
    </div>
  );
}
