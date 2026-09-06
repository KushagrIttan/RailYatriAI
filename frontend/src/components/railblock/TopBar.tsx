import { Activity, ClipboardCheck } from "lucide-react";
import type { KpiSnapshot } from "@/lib/railblock/types";

function Kpi({
  label,
  value,
  suffix,
  tone = "default",
  fill,
}: {
  label: string;
  value: string;
  suffix?: string;
  tone?: "default" | "success" | "warning" | "danger";
  fill?: number;
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
      <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
        {label}
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

export function TopBar({ kpis }: { kpis: KpiSnapshot }) {
  return (
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
              Maintenance planning &amp; corridor access
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-full border border-success/40 bg-success/10 px-3 py-1.5">
          <Activity className="size-3.5 text-success" />
          <span className="animate-ticker num text-[11px] font-medium tracking-tight text-success">
            PLANNING ENGINE ACTIVE · LAST PLAN READY
          </span>
        </div>

        <div className="num ml-auto text-[11px] text-muted-foreground">
          Maintenance Control Desk · NDLS-OCC-04
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 px-5 pb-4 lg:grid-cols-4">
        <Kpi label="Work packages assessed" value={String(kpis.trainsMonitored)} fill={kpis.trainsMonitored * 3} />
        <Kpi
          label="Decisions awaiting review"
          value={String(kpis.activeConflicts)}
          tone={kpis.activeConflicts > 0 ? "danger" : "success"}
          fill={kpis.activeConflicts * 25 + 8}
        />
        <Kpi
          label="Expected delay avoided"
          value={kpis.avgDelaySavedMinutes.toFixed(1)}
          suffix="mins"
          tone="warning"
          fill={kpis.avgDelaySavedMinutes * 5}
        />
        <Kpi
          label="Corridor availability"
          value={kpis.throughputEfficiencyPct.toFixed(1)}
          suffix="%"
          tone="success"
          fill={kpis.throughputEfficiencyPct}
        />
      </div>
    </header>
  );
}
