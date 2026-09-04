import { AlertTriangle, TrainFront } from "lucide-react";
import { SLOT_COUNT } from "@/lib/railblock/service";
import type { ShadowBlock, Train } from "@/lib/railblock/types";

const CLASS_STYLE: Record<Train["trainClass"], { bar: string; dot: string; label: string }> = {
  freight: { bar: "bg-freight/25 border-freight text-freight", dot: "bg-freight", label: "Freight" },
  express: { bar: "bg-express/25 border-express text-express", dot: "bg-express", label: "Express Passenger" },
  suburban: { bar: "bg-suburban/25 border-suburban text-suburban", dot: "bg-suburban", label: "Suburban" },
};

export function TrackView({
  sectors,
  trains,
  shadowBlocks,
  windowOffset,
  selectedTrain,
  onSelectTrain,
}: {
  sectors: string[];
  trains: Train[];
  shadowBlocks: ShadowBlock[];
  windowOffset: number;
  selectedTrain: string | null;
  onSelectTrain: (id: string | null) => void;
}) {
  const slots = Array.from({ length: SLOT_COUNT }, (_, i) => i);
  const nowSlot = Math.round((windowOffset / 100) * (SLOT_COUNT - 1));

  return (
    <div className="panel-surface overflow-hidden">
      {/* time header */}
      <div className="flex border-b border-border bg-background/40">
        <div className="w-24 shrink-0 border-r border-border px-3 py-2 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          Sector
        </div>
        <div className="relative grid flex-1" style={{ gridTemplateColumns: `repeat(${SLOT_COUNT}, minmax(0, 1fr))` }}>
          {slots.map((s) => (
            <div
              key={s}
              className="num border-r border-grid-line/50 py-2 text-center text-[9px] text-muted-foreground last:border-r-0"
            >
              {s % 4 === 0 ? `${String(16 + Math.floor(s / 4)).padStart(2, "0")}:00` : ""}
            </div>
          ))}
        </div>
      </div>

      <div className="relative">
        {/* now line */}
        <div
          className="pointer-events-none absolute bottom-0 top-0 z-20 w-px bg-success/70 transition-all duration-300"
          style={{ left: `calc(6rem + ${((nowSlot + 0.5) / SLOT_COUNT) * 100}% - ${((nowSlot + 0.5) / SLOT_COUNT) * 6}rem)` }}
        >
          <span className="animate-led absolute -left-1 -top-1 size-2 rounded-full bg-success text-success" />
        </div>

        {sectors.map((sector) => {
          const rowTrains = trains.filter((t) => t.sector === sector);
          const rowShadows = shadowBlocks.filter((sb) => sb.sector === sector);
          return (
            <div key={sector} className="flex border-b border-border last:border-b-0">
              <div className="flex w-24 shrink-0 items-center gap-2 border-r border-border px-3 py-3">
                <span className="num text-xs font-semibold">{sector}</span>
              </div>
              <div
                className="relative grid flex-1"
                style={{ gridTemplateColumns: `repeat(${SLOT_COUNT}, minmax(0, 1fr))`, minHeight: "3.75rem" }}
              >
                {slots.map((s) => (
                  <div key={s} className="border-r border-grid-line/40 last:border-r-0" />
                ))}

                {rowShadows.map((sb) =>
                  sb.resolved ? null : (
                    <div
                      key={sb.id}
                      title={`${sb.label} · ${(sb.probability * 100).toFixed(0)}% conflict probability`}
                      className={`animate-shadow-block absolute inset-y-1.5 z-10 rounded-md ${
                        sb.severity === "critical"
                          ? "hatch-alert text-destructive"
                          : "hatch-warn text-warning"
                      }`}
                      style={{
                        left: `${(sb.startSlot / SLOT_COUNT) * 100}%`,
                        width: `${(sb.span / SLOT_COUNT) * 100}%`,
                      }}
                    >
                      <span className="num absolute -top-0.5 left-1 flex items-center gap-1 text-[9px] font-semibold">
                        <AlertTriangle className="size-2.5" />
                        {sb.label}
                      </span>
                    </div>
                  ),
                )}

                {rowTrains.map((t, i) => {
                  const style = CLASS_STYLE[t.trainClass];
                  const active = selectedTrain === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => onSelectTrain(active ? null : t.id)}
                      className={`absolute z-10 flex items-center gap-1.5 overflow-hidden rounded-md border px-2 text-left transition-all duration-500 ease-out ${style.bar} ${
                        active ? "ring-2 ring-ring" : "hover:brightness-125"
                      }`}
                      style={{
                        left: `${(t.startSlot / SLOT_COUNT) * 100}%`,
                        width: `${(t.span / SLOT_COUNT) * 100}%`,
                        top: i % 2 === 0 ? "0.4rem" : "1.9rem",
                        height: "1.5rem",
                      }}
                    >
                      <TrainFront className="size-3 shrink-0" />
                      <span className="num truncate text-[10px] font-semibold">{t.number}</span>
                      {t.delayMinutes > 0 && (
                        <span className="num ml-auto shrink-0 text-[9px] text-warning">+{t.delayMinutes}m</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-4 border-t border-border bg-background/40 px-4 py-2.5">
        {(Object.keys(CLASS_STYLE) as Train["trainClass"][]).map((k) => (
          <span key={k} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <span className={`size-2 rounded-sm ${CLASS_STYLE[k].dot}`} />
            {CLASS_STYLE[k].label}
          </span>
        ))}
        <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <span className="hatch-alert size-2.5 rounded-sm border border-destructive" />
          Shadow block (critical)
        </span>
        <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <span className="hatch-warn size-2.5 rounded-sm border border-warning" />
          Shadow block (watch)
        </span>
      </div>
    </div>
  );
}
