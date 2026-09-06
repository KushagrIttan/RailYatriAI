import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";
import { CalendarDays, CheckCircle2, Clock3, TrendingUp } from "lucide-react";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import type { ChartConfig } from "@/components/ui/chart";
import type { DayBreakdown } from "@/lib/railblock/types";

const chartConfig = {
  scheduled: {
    label: "Scheduled",
    color: "#22c55e",
  },
  deferred: {
    label: "Deferred",
    color: "#f97316",
  },
  workMinutes: {
    label: "Work (min)",
    color: "#6366f1",
  },
} satisfies ChartConfig;

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

export function WeekView({
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
      ? Math.round(
          dayBreakdown.reduce((s, d) => s + d.availabilityGainPct, 0) / dayBreakdown.length,
        )
      : 0;

  const peakDay = dayBreakdown.reduce(
    (best, d, i) => (d.scheduled > (dayBreakdown[best]?.scheduled ?? 0) ? i : best),
    0,
  );

  return (
    <div className="panel-surface overflow-hidden">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-gray-100 px-5 py-3">
        <div className="flex items-center gap-2">
          <CalendarDays className="size-4 text-primary" />
          <h2 className="text-base font-semibold text-foreground tracking-tight">
            7-Day Maintenance Schedule Overview
          </h2>
        </div>
        <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-[10px] font-semibold text-indigo-700 border border-indigo-200">
          Weekly Plan · DLI–GZB
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
          sub="per planning day"
          accent="border-indigo-200"
        />
        <StatPill
          icon={<CalendarDays className="size-5 text-sky-500" />}
          label="Total work time"
          value={`${Math.round(totalWork / 60 * 10) / 10} hrs`}
          sub={`${totalWork} minutes planned`}
          accent="border-sky-200"
        />
      </div>

      {/* Chart */}
      <div className="px-5 pt-5 pb-2">
        <p className="mb-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Scheduled vs. Deferred — click a bar to view that day's detail
        </p>
        <ChartContainer config={chartConfig} className="h-56 w-full">
          <BarChart
            data={dayBreakdown}
            margin={{ top: 4, right: 8, left: -12, bottom: 0 }}
            onClick={(e) => {
              const idx = e?.activeTooltipIndex;
              if (idx !== undefined && idx !== null) onSelectDay(idx);
            }}
          >
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
            <XAxis
              dataKey="label"
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
            <ChartLegend content={<ChartLegendContent />} />

            {/* Highlight selected day */}
            {dayBreakdown[selectedDay] && (
              <ReferenceLine
                x={dayBreakdown[selectedDay]!.label}
                stroke="#6366f1"
                strokeWidth={2}
                strokeDasharray="4 2"
                label={{ value: "viewing", position: "top", fontSize: 9, fill: "#6366f1" }}
              />
            )}

            <Bar dataKey="scheduled" name="scheduled" stackId="a" radius={[0, 0, 0, 0]} maxBarSize={40}>
              {dayBreakdown.map((entry, index) => (
                <Cell
                  key={`cell-s-${index}`}
                  fill={index === peakDay ? "#16a34a" : "#22c55e"}
                  opacity={index === selectedDay ? 1 : 0.72}
                  cursor="pointer"
                />
              ))}
            </Bar>
            <Bar dataKey="deferred" name="deferred" stackId="a" radius={[4, 4, 0, 0]} maxBarSize={40}>
              {dayBreakdown.map((entry, index) => (
                <Cell
                  key={`cell-d-${index}`}
                  fill={index === peakDay ? "#ea580c" : "#f97316"}
                  opacity={index === selectedDay ? 1 : 0.72}
                  cursor="pointer"
                />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>
      </div>

      {/* Work-minutes bar */}
      <div className="px-5 pb-1 pt-1">
        <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Work minutes scheduled per day
        </p>
        <ChartContainer config={chartConfig} className="h-28 w-full">
          <BarChart
            data={dayBreakdown}
            margin={{ top: 4, right: 8, left: -12, bottom: 0 }}
            onClick={(e) => {
              const idx = e?.activeTooltipIndex;
              if (idx !== undefined && idx !== null) onSelectDay(idx);
            }}
          >
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: "#6b7280" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "#6b7280" }}
              axisLine={false}
              tickLine={false}
              unit=" min"
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelKey="label"
                  formatter={(value) => [
                    <span key="wm" className="font-mono font-semibold tabular-nums">
                      {value} min
                    </span>,
                    "Work time",
                  ]}
                />
              }
            />
            <Bar dataKey="workMinutes" name="workMinutes" radius={[4, 4, 0, 0]} maxBarSize={40}>
              {dayBreakdown.map((entry, index) => (
                <Cell
                  key={`cell-wm-${index}`}
                  fill="#6366f1"
                  opacity={index === selectedDay ? 1 : 0.6}
                  cursor="pointer"
                />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>
      </div>

      {/* Day pill row */}
      <div className="flex flex-wrap gap-2 border-t border-border bg-gray-50/60 px-5 py-3">
        {dayBreakdown.map((day, i) => {
          const isSelected = i === selectedDay;
          const isPeak = i === peakDay;
          return (
            <button
              key={day.date}
              onClick={() => onSelectDay(i)}
              title={`${day.scheduled} scheduled · ${day.deferred} deferred · ${day.availabilityGainPct}% window used`}
              className={`flex flex-col items-center rounded-lg border px-3 py-1.5 text-center transition-all cursor-pointer ${
                isSelected
                  ? "border-indigo-400 bg-indigo-50 ring-1 ring-indigo-300 shadow-xs"
                  : "border-border bg-white hover:bg-accent/40"
              }`}
            >
              <span
                className={`text-[11px] font-semibold ${isSelected ? "text-indigo-700" : "text-foreground"}`}
              >
                {day.label}
              </span>
              <span className="mt-0.5 flex items-center gap-1 text-[9px] text-muted-foreground">
                <span className="size-1.5 rounded-full bg-green-500" />
                {day.scheduled}
                {day.deferred > 0 && (
                  <>
                    <span className="size-1.5 rounded-full bg-orange-400" />
                    {day.deferred}
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
        Click any bar or day pill to switch the detail view below to that planning day.
      </p>
    </div>
  );
}
