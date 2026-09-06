import { AlertOctagon, CheckCircle2, ChevronDown, ChevronUp, Clock3, ShieldAlert } from "lucide-react";
import { useState } from "react";
import type { TriageItem, TriageQueue, TriageTier } from "@/lib/railblock/types";

// ─── Style maps ───────────────────────────────────────────────────────────────

const TIER_RING: Record<TriageTier, string> = {
  blocked:  "border-l-4 border-l-red-600",
  critical: "border-l-4 border-l-red-400",
  high:     "border-l-4 border-l-orange-400",
  watch:    "border-l-4 border-l-amber-400",
  clear:    "border-l-4 border-l-green-400",
};

const TIER_BADGE: Record<TriageTier, string> = {
  blocked:  "bg-red-100 text-red-700 border-red-300",
  critical: "bg-red-50 text-red-600 border-red-200",
  high:     "bg-orange-50 text-orange-600 border-orange-200",
  watch:    "bg-amber-50 text-amber-600 border-amber-200",
  clear:    "bg-green-50 text-green-700 border-green-200",
};

const TIER_DOT: Record<TriageTier, string> = {
  blocked:  "bg-red-600",
  critical: "bg-red-400",
  high:     "bg-orange-400",
  watch:    "bg-amber-400",
  clear:    "bg-green-400",
};

const STATUS_STYLE: Record<string, string> = {
  Scheduled:    "bg-success/15 text-success",
  Deferred:     "bg-destructive/10 text-destructive",
  "Shadow Block": "bg-indigo-100 text-indigo-700",
};

const TIER_ORDER: TriageTier[] = ["blocked", "critical", "high", "watch", "clear"];

// ─── Rollup strip ─────────────────────────────────────────────────────────────

function RollupStrip({ rollup }: { rollup: TriageQueue["rollup"] }) {
  const tiles: { key: TriageTier | "backlog"; label: string; value: number; dot: string }[] = [
    { key: "blocked",  label: "Blocked",  value: rollup.blocked,  dot: "bg-red-600"    },
    { key: "critical", label: "Critical", value: rollup.critical, dot: "bg-red-400"    },
    { key: "high",     label: "High",     value: rollup.high,     dot: "bg-orange-400" },
    { key: "watch",    label: "Watch",    value: rollup.watch,    dot: "bg-amber-400"  },
    { key: "clear",    label: "Clear",    value: rollup.clear,    dot: "bg-green-400"  },
    { key: "backlog",  label: "Backlog",  value: rollup.backlog,  dot: "bg-slate-400"  },
  ];

  return (
    <div className="grid grid-cols-3 gap-px border-b border-border bg-border sm:grid-cols-6">
      {tiles.map(({ key, label, value, dot }) => (
        <div key={key} className="flex flex-col items-center gap-1 bg-white px-3 py-2.5">
          <span className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            <span className={`size-1.5 rounded-full ${dot}`} />
            {label}
          </span>
          <span className="num text-xl font-bold tabular-nums text-foreground leading-tight">
            {value}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Score bar ────────────────────────────────────────────────────────────────

function ScoreBar({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color =
    score >= 0.5 ? "bg-red-400" : score >= 0.3 ? "bg-orange-400" : score >= 0.15 ? "bg-amber-400" : "bg-green-400";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="num w-8 text-right text-[10px] tabular-nums text-muted-foreground">
        {score.toFixed(2)}
      </span>
    </div>
  );
}

// ─── Single triage row ────────────────────────────────────────────────────────

function TriageRow({ item }: { item: TriageItem }) {
  const [expanded, setExpanded] = useState(false);
  const tier = item.triageTier;

  return (
    <div className={`overflow-hidden rounded-md border bg-white ${TIER_RING[tier]}`}>
      {/* Collapsed header — always visible */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-gray-50/70 transition-colors cursor-pointer"
      >
        {/* Tier dot */}
        <span className={`size-2 shrink-0 rounded-full ${TIER_DOT[tier]}`} />

        {/* Department + taskId */}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12px] font-semibold text-foreground/90">{item.department}</p>
          <p className="text-[10px] text-muted-foreground/70">{item.taskId}</p>
        </div>

        {/* Score bar */}
        <div className="hidden w-28 sm:block">
          <ScoreBar score={item.triageScore} />
        </div>

        {/* Tier badge */}
        <span className={`hidden shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold sm:inline-flex ${TIER_BADGE[tier]}`}>
          {tier}
        </span>

        {/* Status pill */}
        <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold ${STATUS_STYLE[item.status] ?? "bg-muted text-muted-foreground"}`}>
          {item.status}
        </span>

        {/* Expand toggle */}
        {expanded
          ? <ChevronUp className="size-3.5 shrink-0 text-muted-foreground" />
          : <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />}
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-border/60 px-4 py-3 text-[11px] space-y-3">

          {/* Recommendation banner */}
          <div className={`flex items-start gap-2 rounded-md border px-3 py-2 ${
            tier === "blocked" || tier === "critical"
              ? "border-red-200 bg-red-50 text-red-800"
              : tier === "high"
              ? "border-orange-200 bg-orange-50 text-orange-800"
              : "border-green-200 bg-green-50 text-green-800"
          }`}>
            {tier === "blocked" || tier === "critical"
              ? <AlertOctagon className="size-3.5 mt-0.5 shrink-0" />
              : tier === "high"
              ? <Clock3 className="size-3.5 mt-0.5 shrink-0" />
              : <CheckCircle2 className="size-3.5 mt-0.5 shrink-0" />}
            <span className="font-medium">{item.recommendation}</span>
          </div>

          {/* Two-column detail grid */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-2">
            <Detail label="Section" value={item.sectionId} />
            <Detail label="Location" value={item.locationKm} />
            <Detail label="Work time" value={`${item.workMinutes} min`} />
            <Detail label="Trains at risk" value={String(item.impact.trainsImpacted)} />
            <Detail label="Est. delay" value={`${item.impact.estimatedDelayMinutes} min`} />
            {item.reportedAt && (
              <Detail
                label="Reported"
                value={new Date(item.reportedAt).toLocaleString("en-IN", {
                  day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
                })}
              />
            )}
          </div>

          {/* Score breakdown */}
          <div>
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Score breakdown
            </p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
              <ScoreBreakdown label="ML risk (×0.45)"      value={item.components.mlRisk}      weight={0.45} />
              <ScoreBreakdown label="Exposure (×0.25)"     value={item.components.exposure}    weight={0.25} />
              <ScoreBreakdown label="Age days (×0.15)"     value={item.components.ageDays / 7} weight={0.15} />
              <ScoreBreakdown label="Safety req. (×0.15)"  value={item.components.safetyWeight} weight={0.15} />
            </div>
            <div className="mt-2">
              <ScoreBar score={item.triageScore} />
            </div>
          </div>

          {/* Safety requirements */}
          {item.requirements.length > 0 && (
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Safety requirements
              </p>
              <div className="flex flex-wrap gap-1.5">
                {item.requirements.map((r) => (
                  <span
                    key={r}
                    className="flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[9px] font-medium text-amber-800"
                  >
                    <ShieldAlert className="size-2.5" />
                    {r}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground/60">{label}</p>
      <p className="text-[11px] font-semibold text-foreground/80">{value}</p>
    </div>
  );
}

function ScoreBreakdown({ label, value, weight }: { label: string; value: number; weight: number }) {
  const contribution = Math.round(value * weight * 100) / 100;
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[10px] text-muted-foreground/80">{label}</span>
      <span className="num text-[10px] font-semibold tabular-nums text-foreground/70">
        +{contribution.toFixed(2)}
      </span>
    </div>
  );
}

// ─── Public component ─────────────────────────────────────────────────────────

export function TriagePanel({ triage }: { triage: TriageQueue | null | undefined }) {
  const [filterTier, setFilterTier] = useState<TriageTier | "all">("all");

  if (!triage) return null;

  const { rollup, items } = triage;

  const visible = filterTier === "all"
    ? items
    : items.filter((i) => i.triageTier === filterTier);

  const urgentCount = rollup.blocked + rollup.critical + rollup.high;

  return (
    <div className="panel-surface overflow-hidden">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-gray-100 px-5 py-3">
        <div className="flex items-center gap-2">
          <ShieldAlert className="size-4 text-primary" />
          <h2 className="text-base font-semibold text-foreground tracking-tight">
            Maintenance Triage Queue
          </h2>
        </div>
        <div className="flex items-center gap-2">
          {urgentCount > 0 && (
            <span className="rounded-full border border-red-300 bg-red-50 px-2.5 py-0.5 text-[10px] font-semibold text-red-700">
              {urgentCount} need attention
            </span>
          )}
          <span className="rounded-full bg-gray-200 px-2.5 py-0.5 text-[10px] font-semibold text-gray-600">
            Highest risk {rollup.highestRisk.toFixed(2)}
          </span>
        </div>
      </div>

      {/* Rollup counts */}
      <RollupStrip rollup={rollup} />

      {/* Tier filter pills */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-border bg-white px-5 py-2.5">
        <span className="mr-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          Filter:
        </span>
        <FilterPill label="All" value="all" active={filterTier === "all"} onClick={() => setFilterTier("all")} count={items.length} />
        {TIER_ORDER.map((t) => {
          const count = items.filter((i) => i.triageTier === t).length;
          if (count === 0) return null;
          return (
            <FilterPill
              key={t}
              label={t.charAt(0).toUpperCase() + t.slice(1)}
              value={t}
              active={filterTier === t}
              onClick={() => setFilterTier(t)}
              count={count}
              dot={TIER_DOT[t]}
            />
          );
        })}
      </div>

      {/* Item list */}
      <div className="space-y-2 p-4">
        {visible.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No items in this tier.</p>
        ) : (
          visible.map((item) => <TriageRow key={item.blockId} item={item} />)
        )}
      </div>

      <p className="border-t border-border bg-gray-50/60 px-5 py-2 text-[10px] text-muted-foreground/60">
        Scores: 0.45 × ML risk + 0.25 × train exposure + 0.15 × age + 0.15 × safety requirements.
        Synthetic data only — not live telemetry.
      </p>
    </div>
  );
}

function FilterPill({
  label, value, active, onClick, count, dot,
}: {
  label: string;
  value: string;
  active: boolean;
  onClick: () => void;
  count: number;
  dot?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold transition-colors cursor-pointer ${
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-border bg-white text-muted-foreground hover:bg-accent/40"
      }`}
    >
      {dot && <span className={`size-1.5 rounded-full ${dot}`} />}
      {label}
      <span className="rounded-full bg-muted px-1 text-[9px]">{count}</span>
    </button>
  );
}
