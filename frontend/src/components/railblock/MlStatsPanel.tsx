import { Brain } from "lucide-react";
import type { MlStats, MlTier } from "@/lib/railblock/types";

const TIER_BG: Record<MlTier, string> = {
  critical: "bg-red-100 text-red-700 border-red-200",
  high: "bg-orange-100 text-orange-700 border-orange-200",
  watch: "bg-amber-100 text-amber-700 border-amber-200",
  low: "bg-slate-100 text-slate-500 border-slate-200",
};

const TIER_DOT: Record<MlTier, string> = {
  critical: "bg-red-500",
  high: "bg-orange-500",
  watch: "bg-amber-400",
  low: "bg-slate-400",
};

const STATUS_STYLE: Record<string, string> = {
  Scheduled: "bg-success/15 text-success",
  Deferred: "bg-destructive/10 text-destructive",
  "Shadow Block": "bg-indigo-100 text-indigo-700",
};

export function MlStatsPanel({
  stats,
  approvedCount,
  pendingCount,
}: {
  stats: MlStats | null;
  approvedCount: number;
  pendingCount: number;
}) {
  if (!stats) return null;

  const rangeWidth = stats.scoreMax - stats.scoreMin || 0.01;
  const meanPct = ((stats.scoreMean - stats.scoreMin) / rangeWidth) * 100;

  return (
    <div className="panel-surface overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border bg-gray-50/60 px-4 py-2.5">
        <Brain className="size-3.5 text-primary" />
        <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          ML Decision Intelligence
        </span>
        <span className="animate-led ml-auto size-2 rounded-full bg-success" />
      </div>

      {/* Status badge + stat tiles */}
      <div className="px-4 pt-3">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
              stats.active
                ? "border-success/40 bg-success/10 text-success"
                : "border-warning/40 bg-warning/10 text-warning"
            }`}
          >
            <span className={`size-1.5 rounded-full ${stats.active ? "bg-success" : "bg-warning"}`} />
            {stats.active ? "Model active" : "Heuristic fallback"}
          </span>
          <span className="text-[10px] text-muted-foreground">{stats.engine}</span>
        </div>

        <div className="grid grid-cols-4 gap-3">
          <StatTile label="Cases ranked" value={String(stats.cases)} sub={`${stats.scoredByModel} ML`} />
          <StatTile label="Mean score" value={stats.scoreMean.toFixed(2)} sub={`${stats.scoreMin.toFixed(2)}–${stats.scoreMax.toFixed(2)}`} />
          <StatTile label="High-risk sched." value={String(stats.scheduledHighRisk)} sub={`${stats.deferredCount} deferred`} />
          <StatTile label="Decisions" value={String(stats.decisionsMade)} sub={`${approvedCount} ✓ · ${pendingCount} pending`} />
        </div>
      </div>

      {/* Score distribution mini-bar */}
      <div className="px-4 pt-3">
        <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="absolute left-0 h-full rounded-full bg-primary/30"
            style={{ width: "100%" }}
          />
          <div
            className="absolute top-0 h-full w-1 -translate-x-1/2 rounded-full bg-primary"
            style={{ left: `${meanPct}%` }}
          />
        </div>
      </div>

      {/* Tier chips */}
      <div className="flex flex-wrap items-center gap-1.5 px-4 pt-3">
        {(Object.entries(stats.tiers) as [MlTier, number][]).map(([tier, count]) =>
          count > 0 ? (
            <span
              key={tier}
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${TIER_BG[tier]}`}
            >
              <span className={`size-1.5 rounded-full ${TIER_DOT[tier]}`} />
              {tier}
              <span className="text-[9px] opacity-70">{count}</span>
            </span>
          ) : null,
        )}
      </div>

      {/* Decision feed */}
      <div className="mt-3 border-t border-border">
        <p className="px-4 pt-2.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Decisions from ML ranking
        </p>
        <div className="max-h-44 overflow-y-auto px-4 pt-2 pb-3">
          {stats.decisionFeed.map((d) => {
            const tier = (d.tier ?? "watch") as MlTier;
            return (
              <div
                key={d.blockId}
                className="flex items-center gap-2 py-1.5 text-[11px]"
              >
                <span className={`size-1.5 shrink-0 rounded-full ${TIER_DOT[tier]}`} />
                <span className="flex-1 truncate font-medium text-foreground/80">
                  {d.caseId}
                </span>
                <span className="num shrink-0 w-10 text-right text-muted-foreground">
                  {d.mlScore.toFixed(2)}
                </span>
                <span
                  className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${TIER_BG[tier]}`}
                >
                  {tier}
                </span>
                <span
                  className={`shrink-0 rounded px-1 py-0.5 text-[9px] font-semibold ${
                    STATUS_STYLE[d.status] ?? "bg-muted text-muted-foreground"
                  }`}
                >
                  {d.status}
                </span>
                <span className="shrink-0 w-12 text-right text-[10px] text-muted-foreground/50">
                  day {d.day}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Live footer */}
      <div className="border-t border-border bg-gray-50/60 px-4 py-2 text-[10px] text-muted-foreground">
        Live: {stats.decisionsMade} decisions · {approvedCount} approved · {pendingCount} pending
      </div>
    </div>
  );
}

function StatTile({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="panel-surface rounded-md p-2.5">
      <p className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground/60">
        {label}
      </p>
      <p className="num mt-0.5 text-lg font-semibold leading-tight text-foreground/90">
        {value}
      </p>
      <p className="text-[9px] text-muted-foreground/50">{sub}</p>
    </div>
  );
}
