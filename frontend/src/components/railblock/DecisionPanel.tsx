import { useState } from "react";
import { AlertOctagon, CheckCircle2, CircuitBoard, FlaskConical, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Conflict, ScheduleRecommendation } from "@/lib/railblock/types";

export function DecisionPanel({
  conflict,
  recommendation,
  approving,
  onApprove,
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
  simulation: string | null;
}) {
  const [expanded, setExpanded] = useState(true);

  if (!conflict || !recommendation) {
    return (
      <div className="panel-surface flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
        <ShieldCheck className="size-8 text-success" />
        <p className="text-sm font-medium">All corridors clear</p>
        <p className="text-xs text-muted-foreground">
          No spatial-temporal conflicts in the current projection window.
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
              <span className="num text-sm font-semibold">{conflict.code}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                  critical
                    ? "bg-destructive/15 text-destructive"
                    : "bg-warning/15 text-warning"
                }`}
              >
                {conflict.severity}
              </span>
              <span className="num ml-auto text-[10px] text-muted-foreground">
                T-{conflict.etaMinutes}m · {conflict.detectedAt}
              </span>
            </div>
            <p className="num mt-1 text-xs text-foreground/90">
              Train {conflict.trainA} vs Freight {conflict.trainB} at Block {conflict.blockId}
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
            AI Recommendation Engine
          </span>
          <span className="num ml-auto rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-semibold text-success">
            Confidence: {(recommendation.confidence * 100).toFixed(0)}%
          </span>
        </button>

        <p className="mt-2 text-sm font-medium">{recommendation.strategy}</p>

        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-success transition-all duration-1000 ease-out"
            style={{ width: `${recommendation.confidence * 100}%` }}
          />
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          <Metric label="Delay saved" value={`${recommendation.delaySavedMinutes.toFixed(1)}m`} tone="text-success" />
          <Metric label="Throughput" value={`+${recommendation.throughputDeltaPct.toFixed(1)}%`} tone="text-suburban" />
          <Metric label="Solve time" value={`${recommendation.computeMs}ms`} tone="text-muted-foreground" />
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
              "Applying…"
            ) : (
              "Approve AI Plan"
            )}
          </Button>
          <Button variant="outline" onClick={onOverride} className="border-warning/50 text-warning hover:bg-warning/10">
            <SlidersHorizontal className="size-4" /> Override
          </Button>
          <Button variant="ghost" onClick={onSimulate} className="text-muted-foreground">
            <FlaskConical className="size-4" /> Simulate
          </Button>
        </div>
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
