import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";
import { CalendarRange, CheckCircle2, Clock3, TrendingUp, Wrench } from "lucide-react";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import type { ChartConfig } from "@/components/ui/chart";
import type { DayBreakdown } from "@/lib/railblock/types";

// ─── Chart configs ────────────────────────────────────────────────────────────

const dailyConfig = {
  scheduled: { label: "Scheduled", color: "#22c55e" },
  deferred: { label: "Deferred", color: "#f97316" },
} satisfies ChartConfig;

const weeklyConfig = {
  scheduled: { label: "Scheduled", color: "#22c55e" },
  deferred: { label: "Deferred", color: "#f97316" },
  workMinutes: { label: "Work (min)", color: "#6366f1" },
} satisfies ChartConfig;

const trendConfig = {
  availabilityGainPct: { label: "Availability gain %", color: "#6366f1" },
} satisfies ChartConfig;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Bucket a flat day array into ISO-week groups. */
function groupByWeek(days: DayBreakdown[]): WeekBucket[] {
  const buckets: Record<string, WeekBucket> = {};
  days.forEach((day, i) => {
    const d = new Date(day.date);
    // ISO week number
    const jan4 = new Date(d.getFullYear(), 0, 4);
    const weekNum =
      1 + Math.round(((d.getTime() - jan4.getTime()) / 86400000 - 3 + ((jan4.getDay() + 6) % 7)) / 7);
    const key = `W${weekNum}`;
    if (!buckets[key]) {
      buckets[key] = { week: key, firstDate: day.date, scheduled: 0, deferred: 0, workMinutes: 0, dayIndices: [] };
    }
    buckets[key]!.scheduled += day.scheduled;
    buckets[key]!.deferred += day.deferred;
    buckets[key]!.workMinutes += day.workMinutes;
    buckets[key]!.dayIndices.push(i);
  });
  return Object.values(buckets);
}

interface WeekBucket {
  week: string;
  firstDate: string;
  scheduled: number;
  deferred: number;
  workMinutes: number;
  dayIndices: number[];
}

function StatPill({
  icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  accent: string;
}) {
  return (
    <div className={`flex items-center gap-3 rounded-lg border bg-white px-4 py-3 shadow-xs ${accent}`}>
      <div className="shrink-0">{icon}</div>
      <div className="min-w-0">
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <p className="text-lg font-bold tabular-nums text-foreground leading-tight">{value}</p>
        {sub && <p className="text-[10px] text-muted-foreground/70">{sub}</p>}
      </div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function MonthView({
  dayBreakdown,
  selectedDay,
  onSelectDay,
}: {
  dayBreakdown: DayBreakdown[];
  selectedDay: number;
  onSelectDay: (i: number) => void;
}) {
  const totalScheduled = dayBreakdown.reduce((s, d) => s + d.scheduled, 0);
  const totalDeferred = dayBreakdown.reduce((s, d) => s + d.deferred, 0);
  const totalWork = dayBreakdown.reduce((s, d) => s + d.workMinutes, 0);
  const avgAvailability =
    dayBreakdown.length > 0
      ? Math.round(dayBreakdown.reduce((s, d) => s + d.availabilityGainPct, 0) / dayBreakdown.length)
      : 0;

  const weekBuckets = groupByWeek(dayBreakdown);

  // Which week contains the selected day?
  const selectedWeekIdx = weekBuckets.findIndex((w) => w.dayIndices.includes(selectedDay));

  // Best week by scheduled count
  const peakWeekIdx = weekBuckets.reduce(
    (best, w, i) => (w.scheduled > (weekBuckets[best]?.scheduled ?? 0) ? i : best),
    0,
  );

  return (
    <div className="panel-surface overflow-hidden">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-gray-100 px-5 py-3">
        <div className="flex items-center gap-2">
          <CalendarRange className="size-4 text-primary" />
          <h2 className="text-base font-semibold text-foreground tracking-tight">
            30-Day Maintenance Schedule Overview
          </h2>
        </div>
        <span className="rounded-full bg-violet-100 px-2.5 py-0.5 text-[10px] font-semibold text-violet-700 border border-violet-200">
          Monthly Plan · DLI–GZB
        </span>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 border-b border-border bg-white px-5 py-4 sm:grid-cols-4">
        <StatPill
          icon={<CheckCircle2 className="size-5 text-green-600" />}
          label="Scheduled"
          value={totalScheduled}
          sub={`of ${totalScheduled + totalDeferred} requests`}
          accent="border-green-200"
        />
        <StatPill
          icon={<Clock3 className="size-5 text-orange-500" />}
          label="Deferred"
          value={totalDeferred}
          sub="could not be placed"
          accent="border-orange-200"
        />
        <StatPill
          icon={<TrendingUp className="size-5 text-indigo-500" />}
          label="Avg. availability gain"
          value={`${avgAvailability}%`}
          sub="across 30 days"
          accent="border-indigo-200"
        />
        <StatPill
          icon={<Wrench className="size-5 text-sky-500" />}
          label="Total work time"
          value={`${Math.round((totalWork / 60) * 10) / 10} hrs`}
          sub={`${totalWork} min over the month`}
          accent="border-sky-200"
        />
      </div>

      {/* Section label */}
      <div className="px-5 pt-5 pb-0">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Weekly rollup — scheduled vs. deferred · click to jump to week
        </p>
      </div>

      {/* Weekly stacked bar */}
      <div className="px-5 pt-3 pb-2">
        <ChartContainer config={weeklyConfig} className="h-52 w-full">
          <BarChart
            data={weekBuckets}
            margin={{ top: 4, right: 8, left: -12, bottom: 0 }}
            onClick={(e) => {
              const idx = e?.activeTooltipIndex;
              if (idx !== undefined && idx !== null) {
                const bucket = weekBuckets[idx];
                if (bucket && bucket.dayIndices.length > 0) {
                  onSelectDay(bucket.dayIndices[0]!);
                }
              }
            }}
          >
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
            <XAxis
              dataKey="week"
              tick={{ fontSize: 10, fill: "#6b7280" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "#6b7280" }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelKey="week"
                  formatter={(value, name) => [
                    <span key={name} className="font-mono font-semibold tabular-nums">
                      {value}
                    </span>,
                    name,
                  ]}
                />
              }
            />
            <ChartLegend content={<ChartLegendContent />} />

            {selectedWeekIdx >= 0 && weekBuckets[selectedWeekIdx] && (
              <ReferenceLine
                x={weekBuckets[selectedWeekIdx]!.week}
                stroke="#7c3aed"
                strokeWidth={2}
                strokeDasharray="4 2"
                label={{ value: "viewing", position: "top", fontSize: 9, fill: "#7c3aed" }}
              />
            )}

            <Bar dataKey="scheduled" name="scheduled" stackId="a" maxBarSize={56}>
              {weekBuckets.map((_, i) => (
                <Cell
                  key={`cs-${i}`}
                  fill={i === peakWeekIdx ? "#16a34a" : "#22c55e"}
                  opacity={i === selectedWeekIdx ? 1 : 0.72}
                  cursor="pointer"
                />
              ))}
            </Bar>
            <Bar dataKey="deferred" name="deferred" stackId="a" radius={[4, 4, 0, 0]} maxBarSize={56}>
              {weekBuckets.map((_, i) => (
                <Cell
                  key={`cd-${i}`}
                  fill={i === peakWeekIdx ? "#ea580c" : "#f97316"}
                  opacity={i === selectedWeekIdx ? 1 : 0.72}
                  cursor="pointer"
                />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>
      </div>

      {/* Divider */}
      <div className="border-t border-border/60 mx-5" />

      {/* Availability trend area chart */}
      <div className="px-5 pt-4 pb-2">
        <p className="mb-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Daily availability gain trend (%) · click any point to view that day's detail
        </p>
        <ChartContainer config={trendConfig} className="h-40 w-full">
          <AreaChart
            data={dayBreakdown}
            margin={{ top: 4, right: 8, left: -12, bottom: 0 }}
            onClick={(e) => {
              const idx = e?.activeTooltipIndex;
              if (idx !== undefined && idx !== null) onSelectDay(idx);
            }}
          >
            <defs>
              <linearGradient id="fillAvail" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.35} />
                <stop offset="95%" stopColor="#6366f1" stopOpacity={0.04} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 9, fill: "#9ca3af" }}
              axisLine={false}
              tickLine={false}
              interval={4}
            />
            <YAxis
              tick={{ fontSize: 9, fill: "#9ca3af" }}
              axisLine={false}
              tickLine={false}
              unit="%"
              domain={[0, "auto"]}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelKey="label"
                  formatter={(value) => [
                    <span key="ag" className="font-mono font-semibold tabular-nums">
                      {value}%
                    </span>,
                    "Availability gain",
                  ]}
                />
              }
            />
            {dayBreakdown[selectedDay] && (
              <ReferenceLine
                x={dayBreakdown[selectedDay]!.label}
                stroke="#7c3aed"
                strokeWidth={1.5}
                strokeDasharray="4 2"
              />
            )}
            <Area
              type="monotone"
              dataKey="availabilityGainPct"
              stroke="#6366f1"
              strokeWidth={2}
              fill="url(#fillAvail)"
              dot={false}
              activeDot={{ r: 4, fill: "#6366f1", stroke: "#fff", strokeWidth: 2 }}
              cursor="pointer"
            />
          </AreaChart>
        </ChartContainer>
      </div>

      {/* Divider */}
      <div className="border-t border-border/60 mx-5" />

      {/* Daily compact bar — 30 narrow bars */}
      <div className="px-5 pt-4 pb-2">
        <p className="mb-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Scheduled requests per day
        </p>
        <ChartContainer config={dailyConfig} className="h-28 w-full">
          <BarChart
            data={dayBreakdown}
            margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
            barCategoryGap="10%"
            onClick={(e) => {
              const idx = e?.activeTooltipIndex;
              if (idx !== undefined && idx !== null) onSelectDay(idx);
            }}
          >
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 8, fill: "#9ca3af" }}
              axisLine={false}
              tickLine={false}
              interval={6}
            />
            <YAxis
              tick={{ fontSize: 8, fill: "#9ca3af" }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelKey="label"
                  formatter={(value, name) => [
                    <span key={name} className="font-mono font-semibold tabular-nums">
                      {value}
                    </span>,
                    name,
                  ]}
                />
              }
            />
            {dayBreakdown[selectedDay] && (
              <ReferenceLine
                x={dayBreakdown[selectedDay]!.label}
                stroke="#7c3aed"
                strokeWidth={1.5}
                strokeDasharray="3 2"
              />
            )}
            <Bar dataKey="scheduled" name="scheduled" stackId="a">
              {dayBreakdown.map((_, i) => (
                <Cell
                  key={`ds-${i}`}
                  fill="#22c55e"
                  opacity={i === selectedDay ? 1 : 0.65}
                  cursor="pointer"
                />
              ))}
            </Bar>
            <Bar dataKey="deferred" name="deferred" stackId="a" radius={[2, 2, 0, 0]}>
              {dayBreakdown.map((_, i) => (
                <Cell
                  key={`dd-${i}`}
                  fill="#f97316"
                  opacity={i === selectedDay ? 1 : 0.65}
                  cursor="pointer"
                />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>
      </div>

      {/* Week pill row */}
      <div className="flex flex-wrap gap-2 border-t border-border bg-gray-50/60 px-5 py-3">
        {weekBuckets.map((w, i) => {
          const isSelected = i === selectedWeekIdx;
          const isPeak = i === peakWeekIdx;
          return (
            <button
              key={w.week}
              onClick={() => {
                if (w.dayIndices.length > 0) onSelectDay(w.dayIndices[0]!);
              }}
              title={`${w.scheduled} scheduled · ${w.deferred} deferred · ${Math.round(w.workMinutes / 60 * 10) / 10} hrs work`}
              className={`flex flex-col items-center rounded-lg border px-4 py-1.5 transition-all cursor-pointer ${
                isSelected
                  ? "border-violet-400 bg-violet-50 ring-1 ring-violet-300 shadow-xs"
                  : "border-border bg-white hover:bg-accent/40"
              }`}
            >
              <span
                className={`text-[11px] font-semibold ${isSelected ? "text-violet-700" : "text-foreground"}`}
              >
                {w.week}
              </span>
              <span className="mt-0.5 flex items-center gap-1 text-[9px] text-muted-foreground">
                <span className="size-1.5 rounded-full bg-green-500" />
                {w.scheduled}
                {w.deferred > 0 && (
                  <>
                    <span className="size-1.5 rounded-full bg-orange-400" />
                    {w.deferred}
                  </>
                )}
              </span>
              {isPeak && (
                <span className="mt-0.5 rounded bg-green-100 px-1 py-0 text-[8px] font-bold text-green-700">
                  peak
                </span>
              )}
            </button>
          );
        })}
      </div>

      <p className="border-t border-border px-5 py-2.5 text-[10px] text-muted-foreground/60">
        Click any chart element or week pill to drill into that day's Gantt view in the work queue below.
      </p>
    </div>
  );
}
