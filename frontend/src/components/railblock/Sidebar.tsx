import { Activity, ClipboardCheck, LayoutDashboard, TrainFront } from "lucide-react";
import type { KpiSnapshot } from "@/lib/railblock/types";

type NavItem = { label: string; icon: React.ReactNode; active?: boolean; badge?: number };

function NavLink({ label, icon, active, badge }: NavItem) {
  return (
    <div
      className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
        active
          ? "bg-accent font-medium text-primary"
          : "text-muted-foreground hover:bg-gray-50 hover:text-foreground"
      }`}
    >
      <span className={`size-4 shrink-0 ${active ? "text-primary" : ""}`}>{icon}</span>
      <span className="flex-1">{label}</span>
      {badge !== undefined && (
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
            active ? "bg-primary/15 text-primary" : "bg-gray-100 text-muted-foreground"
          }`}
        >
          {badge}
        </span>
      )}
    </div>
  );
}

function KpiChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "default" | "success" | "warning" | "danger";
}) {
  const dot =
    tone === "success"
      ? "bg-success"
      : tone === "warning"
        ? "bg-warning"
        : tone === "danger"
          ? "bg-destructive"
          : "bg-primary";
  return (
    <div className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1.5">
        <span className={`size-1.5 rounded-full ${dot}`} />
        <span className="num text-xs font-semibold text-foreground">{value}</span>
      </div>
    </div>
  );
}

export function Sidebar({
  kpis,
  onOpenGuide,
  replayContext,
}: {
  kpis: KpiSnapshot;
  onOpenGuide: () => void;
  replayContext?: { corridorLabel: string; capturedAt: string } | undefined;
}) {
  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-border bg-white">
      {/* Logo */}
      <div className="flex items-center gap-2.5 border-b border-border px-5 py-4">
        <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10">
          <ClipboardCheck className="size-4 text-primary" />
        </div>
        <div>
          <span className="text-sm font-bold tracking-tight text-foreground">
            Rail<span className="text-primary">Block</span>AI
          </span>
        </div>
        <span className="animate-led ml-auto size-2 rounded-full bg-success" title="Planning scenario active" />
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
        {/* Overview */}
        <div>
          <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
            Overview
          </p>
          <div className="space-y-0.5">
            <NavLink label="Dashboard" icon={<LayoutDashboard className="size-4" />} active />
          </div>
        </div>

        {/* Corridors */}
        <div>
          <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
            Active Corridor
          </p>
          <div className="space-y-0.5">
            <NavLink
              label={replayContext?.corridorLabel ?? "Planning scenario"}
              icon={<TrainFront className="size-4" />}
              active={false}
            />
          </div>
          {replayContext && (
            <p className="mt-1.5 px-3 text-[10px] text-muted-foreground/50">
              Saved · {new Date(replayContext.capturedAt).toLocaleDateString("en-IN")}
            </p>
          )}
        </div>

        {/* KPI summary */}
        <div>
          <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
            At a glance
          </p>
          <div className="space-y-1.5">
            <KpiChip label="Requests reviewed" value={String(kpis.trainsMonitored)} tone="default" />
            <KpiChip
              label="Decisions pending"
              value={String(kpis.activeConflicts)}
              tone={kpis.activeConflicts > 0 ? "danger" : "success"}
            />
            <KpiChip
              label="Disruption avoided"
              value={`${kpis.avgDelaySavedMinutes.toFixed(1)} min`}
              tone="warning"
            />
            <KpiChip
              label="Maintenance window"
              value={`${kpis.throughputEfficiencyPct.toFixed(1)}%`}
              tone="success"
            />
          </div>
        </div>
      </nav>

      {/* Footer / user */}
      <div className="border-t border-border px-4 py-3">
        <button
          onClick={onOpenGuide}
          className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-xs text-muted-foreground transition-colors hover:bg-gray-50 hover:text-foreground"
        >
          <Activity className="size-4 text-success" />
          <span>How this works</span>
        </button>
        <div className="mt-1 flex items-center gap-2.5 rounded-lg px-2 py-2">
          <div className="flex size-7 items-center justify-center rounded-full bg-primary/15 text-[11px] font-semibold text-primary">
            RB
          </div>
          <div className="min-w-0">
            <p className="truncate text-[11px] font-medium text-foreground">Planning workspace</p>
            <p className="truncate text-[10px] text-muted-foreground">Prototype · saved data only</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
