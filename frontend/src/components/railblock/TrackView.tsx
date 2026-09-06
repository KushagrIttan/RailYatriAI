import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  TrainFront,
  Wrench,
} from "lucide-react";
import { SLOT_COUNT } from "@/lib/railblock/service";
import type { ShadowBlock, Train } from "@/lib/railblock/types";

const CLASS_STYLE: Record<Train["trainClass"], string> = {
  freight: "border-gray-400 bg-gray-200 text-gray-700",
  express: "border-blue-400 bg-blue-100 text-blue-700",
  suburban: "border-sky-400 bg-sky-100 text-sky-700",
};

function sectionLabel(section: string) {
  return section === "DLI-GZB-DN" ? "Delhi → Ghaziabad" : section;
}

export function TrackView({
  sectors,
  trains,
  shadowBlocks,
  windowOffset,
  selectedTrain,
  onSelectTrain,
  selectedConflictId,
  onSelectConflict,
}: {
  sectors: string[];
  trains: Train[];
  shadowBlocks: ShadowBlock[];
  windowOffset: number;
  selectedTrain: string | null;
  onSelectTrain: (id: string | null) => void;
  selectedConflictId?: string | null;
  onSelectConflict?: (id: string | null) => void;
}) {
  const slots = Array.from({ length: SLOT_COUNT }, (_, i) => i);
  const nowSlot = Math.round((windowOffset / 100) * (SLOT_COUNT - 1));

  const windowLabel = (() => {
    const totalSlots = SLOT_COUNT - 1;
    const slot = Math.round((windowOffset / 100) * totalSlots);
    const anchorHour = 8;
    const hours = anchorHour + Math.floor(slot / 4);
    const minutes = (slot % 4) * 15;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  })();

  const activeBlock =
    shadowBlocks.find((sb) => sb.conflictId === selectedConflictId) ??
    shadowBlocks[0] ??
    null;

  return (
    <div className="panel-surface overflow-hidden">
      {/* Section header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-gray-100 px-5 py-3">
        <div className="flex items-center gap-2">
          <Wrench className="size-4 text-primary" />
          <h2 className="text-base font-semibold text-foreground tracking-tight">
            Suggested maintenance times & track occupancy
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-gray-200 px-2.5 py-0.5 text-[10px] font-semibold text-gray-700">
            3 Simulated Situations
          </span>
          <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-[10px] font-medium text-green-800 border border-green-300">
            Saved timetable
          </span>
        </div>
      </div>

      {/* Scenario switcher pills */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-white px-5 py-2 text-xs">
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mr-1">
          Scenarios:
        </span>
        {shadowBlocks.map((sb, idx) => {
          const isSelected = activeBlock?.id === sb.id;
          const statusBadge =
            sb.status === "scheduled"
              ? "border-green-400 bg-green-100 text-green-800"
              : sb.status === "blocked"
                ? "border-red-400 bg-red-100 text-red-800"
                : "border-amber-400 bg-amber-100 text-amber-800";

          const icon =
            sb.status === "scheduled" ? (
              <CheckCircle2 className="size-3 text-green-600" />
            ) : sb.status === "blocked" ? (
              <AlertOctagon className="size-3 text-red-600" />
            ) : (
              <Clock3 className="size-3 text-amber-600" />
            );

          return (
            <button
              key={sb.id}
              onClick={() => onSelectConflict?.(sb.conflictId)}
              className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] font-medium transition-all cursor-pointer ${
                isSelected
                  ? "border-primary bg-primary/10 text-primary font-semibold ring-1 ring-primary shadow-xs"
                  : `${statusBadge} hover:opacity-90`
              }`}
            >
              {icon}
              <span>
                Case {idx + 1}: {sb.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Time axis */}
      <div className="flex border-b border-border bg-gray-50/40">
        <div className="w-32 shrink-0 border-r border-border px-4 py-2 text-[10px] font-medium uppercase tracking-widest text-muted-foreground/60">
          Track section
        </div>
        <div
          className="relative grid flex-1"
          style={{ gridTemplateColumns: `repeat(${SLOT_COUNT}, minmax(0, 1fr))` }}
        >
          {slots.map((s) => (
            <div
              key={s}
              className="num border-r border-border/50 py-2 text-center text-[9px] text-muted-foreground/50 last:border-r-0"
            >
              {s % 4 === 0 ? `${String(8 + Math.floor(s / 4)).padStart(2, "0")}:00` : ""}
            </div>
          ))}
        </div>
      </div>

      {/* Track rows */}
      <div className="relative">
        {/* NOW marker */}
        <div
          className="pointer-events-none absolute bottom-0 top-0 z-30 w-px bg-success/70"
          style={{
            left: `calc(8rem + ${((nowSlot + 0.5) / SLOT_COUNT) * 100}% - ${
              ((nowSlot + 0.5) / SLOT_COUNT) * 8
            }rem)`,
          }}
        >
          <span className="absolute -top-0.5 -translate-x-1/2 rounded bg-success px-1.5 py-0.5 text-[8px] font-bold text-white shadow-xs">
            {windowLabel}
          </span>
        </div>

        {sectors.map((sector, idx) => {
          const rowTrains = trains.filter((t) => t.sector === sector);
          const rowShadows = shadowBlocks.filter((sb) => sb.sector === sector && !sb.resolved);

          return (
            <div
              key={sector}
              className={`flex border-b border-border last:border-b-0 ${
                idx % 2 === 0 ? "" : "bg-gray-50/40"
              }`}
            >
              <div className="flex w-32 shrink-0 flex-col justify-center border-r border-border px-4 py-4">
                <span className="text-xs font-semibold text-foreground">
                  {sectionLabel(sector)}
                </span>
                <span className="mt-0.5 text-[10px] text-muted-foreground/60">
                  {rowShadows.length} situations
                </span>
              </div>

              <div
                className="relative grid flex-1"
                style={{
                  gridTemplateColumns: `repeat(${SLOT_COUNT}, minmax(0, 1fr))`,
                  minHeight: "7rem",
                }}
              >
                {slots.map((s) => (
                  <div key={s} className="border-r border-border/30 last:border-r-0" />
                ))}

                {/* Maintenance / Situation blocks on the timeline */}
                {rowShadows.map((sb) => {
                  const isSelected = activeBlock?.id === sb.id;
                  let styleClass = "";
                  let icon = <AlertTriangle className="size-2.5 shrink-0" />;
                  let statusTag = "";

                  if (sb.status === "scheduled") {
                    styleClass = isSelected
                      ? "border-green-600 bg-green-200 text-green-900 ring-2 ring-green-600 shadow-md z-25"
                      : "border-green-400 bg-green-100 text-green-800 hover:border-green-500";
                    icon = <CheckCircle2 className="size-3 shrink-0 text-green-700" />;
                    statusTag = "✅ Approved Window";
                  } else if (sb.status === "blocked") {
                    styleClass = isSelected
                      ? "border-2 border-dashed border-red-600 bg-red-200 text-red-950 ring-2 ring-red-500 shadow-md z-25"
                      : "border border-dashed border-red-400 bg-red-100 text-red-800 hover:border-red-500";
                    icon = <AlertOctagon className="size-3 shrink-0 text-red-600" />;
                    statusTag = "❌ Blocked by EMU";
                  } else {
                    styleClass = isSelected
                      ? "border-2 border-dashed border-amber-600 bg-amber-200 text-amber-950 ring-2 ring-amber-500 shadow-md z-25"
                      : "border border-dashed border-amber-400 bg-amber-100 text-amber-900 hover:border-amber-500";
                    icon = <Clock3 className="size-3 shrink-0 text-amber-600" />;
                    statusTag = "⏳ Deferred (60m)";
                  }

                  return (
                    <button
                      key={sb.id}
                      onClick={() => onSelectConflict?.(sb.conflictId)}
                      title={`${sb.label} · ${sb.conflictReason ?? ""}`}
                      className={`absolute top-2 z-20 flex h-9.5 items-center gap-1.5 overflow-hidden rounded-md px-2 text-left text-[10px] font-semibold transition-all cursor-pointer ${styleClass}`}
                      style={{
                        left: `${(sb.startSlot / SLOT_COUNT) * 100}%`,
                        width: `${(sb.span / SLOT_COUNT) * 100}%`,
                      }}
                    >
                      {icon}
                      <div className="flex flex-col overflow-hidden leading-tight">
                        <span className="truncate">{sb.label}</span>
                        <span className="text-[8.5px] font-medium opacity-85 truncate">
                          {statusTag}
                        </span>
                      </div>
                    </button>
                  );
                })}

                {/* Train chips */}
                {rowTrains.map((t, i) => {
                  const style = CLASS_STYLE[t.trainClass];
                  const active = selectedTrain === t.id;
                  const isClashing = activeBlock?.blockingTrainNumbers?.includes(t.number);

                  let trainStyle = style;
                  if (isClashing) {
                    trainStyle =
                      "border-red-400 bg-red-100 text-red-900 font-bold ring-2 ring-red-500 animate-pulse shadow-sm";
                  }

                  return (
                    <button
                      key={t.id}
                      onClick={() => onSelectTrain(active ? null : t.id)}
                      className={`absolute z-10 flex h-6.5 items-center gap-1.5 overflow-hidden rounded border px-2 text-left text-[9px] transition-all hover:opacity-100 hover:shadow-xs cursor-pointer ${trainStyle} ${
                        isClashing
                          ? "opacity-100 z-20"
                          : active
                            ? "opacity-100 ring-2 ring-primary/40"
                            : activeBlock
                              ? "opacity-80"
                              : "opacity-85"
                      }`}
                      style={{
                        left: `${(t.startSlot / SLOT_COUNT) * 100}%`,
                        width: `${(t.span / SLOT_COUNT) * 100}%`,
                        bottom: `${0.5 + (i % 2) * 1.5}rem`,
                      }}
                      title={
                        isClashing
                          ? `Train ${t.number} (${t.name}) conflicts with the requested maintenance window!`
                          : `Train ${t.number}: ${t.name}`
                      }
                    >
                      <TrainFront className="size-3 shrink-0" />
                      <span className="num font-semibold truncate">{t.number}</span>
                      {isClashing && (
                        <span className="rounded bg-red-600 px-1 py-0.2 text-[8px] font-bold text-white shrink-0">
                          CLASH
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Explainer Callout Bar for Active Situation */}
      {activeBlock && (
        <div
          className={`flex items-start gap-2.5 border-t px-5 py-2.5 text-xs transition-colors ${
            activeBlock.status === "scheduled"
              ? "border-green-300 bg-green-100 text-green-900"
              : activeBlock.status === "blocked"
                ? "border-red-300 bg-red-100 text-red-900"
                : "border-amber-300 bg-amber-100 text-amber-900"
          }`}
        >
          {activeBlock.status === "scheduled" ? (
            <CheckCircle2 className="size-4 shrink-0 text-green-600 mt-0.5" />
          ) : activeBlock.status === "blocked" ? (
            <AlertOctagon className="size-4 shrink-0 text-red-600 mt-0.5" />
          ) : (
            <Clock3 className="size-4 shrink-0 text-amber-600 mt-0.5" />
          )}
          <div className="flex-1">
            <span className="font-semibold">{activeBlock.label}: </span>
            <span className="opacity-90">
              {activeBlock.status === "scheduled"
                ? "Safe gap detected between 11:10 and 12:55. A 45-minute window is approved with 0 minutes train delay."
                : activeBlock.status === "blocked"
                  ? "Attempted slot during morning rush (09:00). Blocked by dense EMU commuter traffic (Trains 64152 & 64414 highlighted with red CLASH tags)."
                  : "Requires 60 minutes continuous possession. Blocked by EMU Special 04942. Deferred to scheduled off-peak or overnight window."}
            </span>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-1.5 border-t border-border bg-gray-100 px-5 py-2 text-[10px] text-muted-foreground">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-sm bg-green-500" />
            Approved Shadow Block
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-sm border border-dashed border-red-500 bg-red-200" />
            Blocked by Peak Traffic
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-sm border border-dashed border-amber-500 bg-amber-200" />
            Deferred (Needs Longer Gap)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="rounded bg-red-600 px-1 text-[8px] font-bold text-white">
              CLASH
            </span>
            Blocking Train
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="flex items-center gap-1">
            <TrainFront className="size-3 text-gray-500" />
            Freight
          </span>
          <span className="flex items-center gap-1">
            <TrainFront className="size-3 text-blue-500" />
            Express
          </span>
          <span className="flex items-center gap-1">
            <TrainFront className="size-3 text-sky-500" />
            Suburban
          </span>
        </div>
      </div>
    </div>
  );
}
