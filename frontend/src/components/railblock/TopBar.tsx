import { Activity, CircleHelp, ClipboardCheck, Info } from "lucide-react";
import type { KpiSnapshot, ReplayContext } from "@/lib/railblock/types";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

function Kpi({
  label,
  value,
  suffix,
  tone = "default",
  fill,
  help,
}: {
  label: string;
  value: string;
  suffix?: string;
  tone?: "default" | "success" | "warning" | "danger";
  fill?: number;
  help?: string;
}) {
  const toneClass =
    tone === "success"
      ? "text-success"
      : tone === "warning"
        ? "text-warning"
        : tone === "danger"
          ? "text-destructive"
          : "text-foreground";
  const barClass =
    tone === "success"
      ? "bg-success"
      : tone === "warning"
        ? "bg-warning"
        : tone === "danger"
          ? "bg-destructive"
          : "bg-freight";

  return (
    <div className="panel-surface relative overflow-hidden px-4 py-3">
      <div className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
        {label}
        {help && <Tooltip><TooltipTrigger asChild><button aria-label={`About ${label}`} className="text-muted-foreground hover:text-foreground"><Info className="size-3" /></button></TooltipTrigger><TooltipContent className="max-w-56 normal-case tracking-normal">{help}</TooltipContent></Tooltip>}
      </div>
      <div className={`num mt-1 text-2xl font-semibold ${toneClass}`}>
        {value}
        {suffix ? <span className="ml-1 text-sm text-muted-foreground">{suffix}</span> : null}
      </div>
      <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full transition-all duration-700 ease-out ${barClass}`}
          style={{ width: `${Math.min(100, Math.max(4, fill ?? 60))}%` }}
        />
      </div>
    </div>
  );
}

export function TopBar({ kpis, onOpenGuide, replayContext, horizonLabel }: { kpis: KpiSnapshot; onOpenGuide: () => void; replayContext?: ReplayContext; horizonLabel?: string }) {
  return (
    <TooltipProvider delayDuration={150}>
    <header className="border-b border-border bg-panel/70 backdrop-blur">
      <div className="flex flex-wrap items-center gap-4 px-5 py-3">
        <div className="flex items-center gap-3">
          <div className="relative grid size-9 place-items-center rounded-md border border-border bg-background">
            <ClipboardCheck className="size-5 text-success" />
            <span className="animate-led absolute -right-1 -top-1 size-2.5 rounded-full bg-success text-success" />
          </div>
          <div>
            <h1 className="text-base font-semibold tracking-tight">
              Rail<span className="text-success">Block</span>AI
            </h1>
            <p className="text-[11px] text-muted-foreground">
              Plan maintenance around saved train times
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-full border border-success/40 bg-success/10 px-3 py-1.5">
          <Activity className="size-3.5 text-success" />
          <span className="animate-ticker num text-[11px] font-medium tracking-tight text-success">
            {replayContext ? `SAVED TIMETABLE SCENARIO · ${new Date(replayContext.capturedAt).toLocaleDateString("en-IN")}` : "PLANNING SCENARIO"}
            {horizonLabel ? ` · ${horizonLabel}` : ""}
          </span>
        </div>

        <div className="num ml-auto text-[11px] text-muted-foreground">
          {replayContext ? `${replayContext.corridorLabel} · saved train times` : "Maintenance planning workspace"}
        </div>
        <button onClick={onOpenGuide} className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"><CircleHelp className="size-4" />How this works</button>
      </div>

      <div className="grid grid-cols-2 gap-3 px-5 pb-4 lg:grid-cols-4">
        <Kpi label="Maintenance requests reviewed" value={String(kpis.trainsMonitored)} fill={kpis.trainsMonitored * 3} help="The maintenance requests considered in this saved timetable scenario." />
        <Kpi
          label="Maintenance decisions to review"
          value={String(kpis.activeConflicts)}
          tone={kpis.activeConflicts > 0 ? "danger" : "success"}
          fill={kpis.activeConflicts * 25 + 8}
          help="Suggested work times that still need a planning decision in this prototype."
        />
        <Kpi
          label="Estimated disruption avoided"
          value={kpis.avgDelaySavedMinutes.toFixed(1)}
          suffix="mins"
          tone="warning"
          fill={kpis.avgDelaySavedMinutes * 5}
          help="A timetable-based estimate, not a live prediction."
        />
        <Kpi
          label="Time available for maintenance"
          value={kpis.throughputEfficiencyPct.toFixed(1)}
          suffix="%"
          tone="success"
          fill={kpis.throughputEfficiencyPct}
          help="The share of the saved timetable horizon that has a gap between scheduled trains."
        />
      </div>
    </header>
    </TooltipProvider>
  );
}
