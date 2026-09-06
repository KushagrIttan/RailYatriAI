import { CircleHelp, Gauge, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CORRIDORS } from "@/lib/railblock/service";

export function TopBar({
  corridorId,
  setCorridorId,
  loading,
  onRefresh,
  windowOffset,
  setWindowOffset,
  windowLabel,
  onOpenGuide,
}: {
  corridorId: string;
  setCorridorId: (id: string) => void;
  loading: boolean;
  onRefresh: () => void;
  windowOffset: number;
  setWindowOffset: (v: number) => void;
  windowLabel: string;
  onOpenGuide: () => void;
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
    <div className="flex h-14 shrink-0 items-center gap-4 border-b border-border bg-white px-6">
      {/* Corridor selector */}
      <Select value={corridorId} onValueChange={setCorridorId}>
        <SelectTrigger className="w-52 bg-white text-sm shadow-none">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {CORRIDORS.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

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

      {/* Time window slider */}
      <div className="flex min-w-48 flex-1 items-center gap-3">
        <Gauge className="size-4 shrink-0 text-muted-foreground" />
        <Slider
          value={[windowOffset]}
          onValueChange={(v) => setWindowOffset(v[0] ?? 0)}
          max={100}
          step={1}
          className="flex-1"
        />
        <span className="num w-28 shrink-0 text-right text-xs text-muted-foreground">
          {windowLabel}
        </span>
      </div>

      {/* Help */}
      <button
        onClick={onOpenGuide}
        className="ml-auto flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-gray-50 hover:text-foreground"
      >
        <CircleHelp className="size-4" />
        How this works
      </button>
    </div>
  );
}
