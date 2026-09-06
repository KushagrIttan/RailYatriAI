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

      {/* Refresh */}
      <Button
        variant="outline"
        size="sm"
        disabled={loading}
        onClick={onRefresh}
        className="h-8 gap-1.5 border-border text-sm shadow-none"
      >
        <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
        {loading ? "Loading…" : "Refresh"}
      </Button>

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
