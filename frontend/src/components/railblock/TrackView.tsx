import { AlertTriangle, TrainFront, Wrench } from "lucide-react";
import { SLOT_COUNT } from "@/lib/railblock/service";
import type { ShadowBlock, Train } from "@/lib/railblock/types";

const CLASS_STYLE: Record<Train["trainClass"], string> = {
  freight: "border-freight/35 bg-freight/10 text-freight/80",
  express: "border-express/35 bg-express/10 text-express/80",
  suburban: "border-suburban/35 bg-suburban/10 text-suburban/80",
};

function sectionLabel(section: string) {
  return section === "DLI-GZB-DN" ? "Delhi Junction → Ghaziabad" : section;
}

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
      <div className="flex items-center justify-between border-b border-border bg-background/45 px-4 py-3">
        <div>
          <div className="flex items-center gap-2"><Wrench className="size-4 text-success" /><h2 className="text-sm font-semibold">Suggested maintenance times</h2></div>
          <p className="mt-0.5 text-xs text-muted-foreground">These suggestions use gaps in the saved train timetable. They are not live operating instructions.</p>
        </div>
        <span className="hidden rounded-full bg-success/10 px-2 py-1 text-[10px] font-medium text-success sm:block">Saved timetable</span>
      </div>
      <div className="flex border-b border-border bg-background/25">
        <div className="w-32 shrink-0 border-r border-border px-3 py-2 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">Track section</div>
        <div className="relative grid flex-1" style={{ gridTemplateColumns: `repeat(${SLOT_COUNT}, minmax(0, 1fr))` }}>
          {slots.map((s) => (
            <div
              key={s}
              className="num border-r border-grid-line/50 py-2 text-center text-[9px] text-muted-foreground last:border-r-0"
            >
              {s % 4 === 0 ? `${String(8 + Math.floor(s / 4)).padStart(2, "0")}:00` : ""}
            </div>
          ))}
        </div>
      </div>

      <div className="relative">
        <div
          className="pointer-events-none absolute bottom-0 top-0 z-30 w-px bg-success/70"
          style={{ left: `calc(8rem + ${((nowSlot + 0.5) / SLOT_COUNT) * 100}% - ${((nowSlot + 0.5) / SLOT_COUNT) * 8}rem)` }}
        >
          <span className="absolute -top-0.5 -translate-x-1/2 rounded bg-success px-1 py-0.5 text-[8px] font-semibold text-success-foreground">NOW</span>
        </div>

        {sectors.map((sector) => {
          const rowTrains = trains.filter((t) => t.sector === sector);
          const rowShadows = shadowBlocks.filter((sb) => sb.sector === sector && !sb.resolved);
          return (
            <div key={sector} className="flex border-b border-border last:border-b-0">
              <div className="flex w-32 shrink-0 flex-col justify-center border-r border-border px-3 py-3">
                <span className="text-xs font-semibold">{sectionLabel(sector)}</span>
                <span className="mt-0.5 text-[10px] text-muted-foreground">{rowShadows.length ? "Maintenance decision ready" : "No maintenance request"}</span>
              </div>
              <div
                className="relative grid flex-1"
                style={{ gridTemplateColumns: `repeat(${SLOT_COUNT}, minmax(0, 1fr))`, minHeight: "5.25rem" }}
              >
                {slots.map((s) => (
                  <div key={s} className="border-r border-grid-line/40 last:border-r-0" />
                ))}

                {rowShadows.map((sb) =>
                  sb.resolved ? null : (
                    <div
                      key={sb.id}
                      title={`${sb.label} · ${(sb.probability * 100).toFixed(0)}% conflict probability`}
                      className={`absolute top-2 z-20 flex h-8 items-center gap-1.5 overflow-hidden rounded border px-2 ${
                        sb.severity === "critical"
                          ? "border-destructive bg-destructive/15 text-destructive"
                          : "border-warning bg-warning/15 text-warning"
                      }`}
                      style={{
                        left: `${(sb.startSlot / SLOT_COUNT) * 100}%`,
                        width: `${(sb.span / SLOT_COUNT) * 100}%`,
                      }}
                    >
                      <span className="flex min-w-0 items-center gap-1 text-[10px] font-semibold">
                        <AlertTriangle className="size-2.5" />
                        <span className="truncate">Suggested maintenance work · {sb.label}</span>
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
                      className={`absolute z-10 flex h-5 items-center gap-1 overflow-hidden rounded border px-1.5 text-left opacity-65 transition-opacity hover:opacity-100 ${style} ${
                        active ? "ring-1 ring-ring opacity-100" : ""
                      }`}
                      style={{
                        left: `${(t.startSlot / SLOT_COUNT) * 100}%`,
                        width: `${(t.span / SLOT_COUNT) * 100}%`,
                        bottom: `${0.45 + (i % 2) * 1.25}rem`,
                      }}
                    >
                      <TrainFront className="size-2.5 shrink-0" />
                      <span className="num truncate text-[9px]">{t.number}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border bg-background/35 px-4 py-2.5 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-destructive/70" />Urgent maintenance work</span>
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-warning/70" />Suggested maintenance time</span>
        <span className="flex items-center gap-1.5"><TrainFront className="size-3 text-suburban" />Scheduled train</span>
      </div>
    </div>
  );
}
