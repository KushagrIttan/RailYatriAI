import { useCallback, useEffect, useMemo, useState } from "react";
import { Gauge } from "lucide-react";
import { TopBar } from "@/components/railblock/TopBar";
import { TrackView } from "@/components/railblock/TrackView";
import { DecisionPanel } from "@/components/railblock/DecisionPanel";
import { LogStream } from "@/components/railblock/LogStream";
import { DebugDrawer } from "@/components/railblock/DebugDrawer";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AMBIENT_LOG_MESSAGES,
  CORRIDORS,
  fetchOptimizationSchedule,
  makeLog,
} from "@/lib/railblock/service";
import type { LogEntry, OptimizationSchedule } from "@/lib/railblock/types";

export default function App() {
  const [corridorId, setCorridorId] = useState(CORRIDORS[0]!.id);
  const [schedule, setSchedule] = useState<OptimizationSchedule | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [windowOffset, setWindowOffset] = useState(20);
  const [selectedTrain, setSelectedTrain] = useState<string | null>(null);
  const [approving, setApproving] = useState<"idle" | "working" | "done">("idle");
  const [simulation, setSimulation] = useState<string | null>(null);
  const [debugOpen, setDebugOpen] = useState(false);

  const pushLog = useCallback((message: string, level: LogEntry["level"] = "info") => {
    setLogs((prev) => [...prev.slice(-80), makeLog(message, level)]);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setApproving("idle");
    setSimulation(null);
    fetchOptimizationSchedule(corridorId).then((data) => {
      if (cancelled) return;
      setSchedule(data);
      pushLog(`Schedule payload loaded for ${corridorId} (Greedy-Shadow ${data.version})`, "success");
      pushLog(`${data.conflicts.length} shadow-block conflict(s) projected`, data.conflicts.length ? "warn" : "info");
    });
    return () => {
      cancelled = true;
    };
  }, [corridorId, pushLog]);

  useEffect(() => {
    const id = setInterval(() => {
      const pick = AMBIENT_LOG_MESSAGES[Math.floor(Math.random() * AMBIENT_LOG_MESSAGES.length)]!;
      pushLog(pick.message, pick.level);
    }, 5200);
    return () => clearInterval(id);
  }, [pushLog]);

  const corridor = useMemo(
    () => CORRIDORS.find((c) => c.id === corridorId) ?? CORRIDORS[0]!,
    [corridorId],
  );

  const activeConflict = schedule?.conflicts.find((c) => !c.resolved) ?? null;
  const activeRecommendation =
    schedule?.recommendations.find((r) => r.conflictId === activeConflict?.id) ?? null;

  const handleApprove = () => {
    if (!schedule || !activeConflict || !activeRecommendation) return;
    setApproving("working");
    pushLog(`Controller approved plan ${activeRecommendation.id} for ${activeConflict.code}`, "info");

    setTimeout(() => {
      setSchedule((prev) => {
        if (!prev) return prev;
        const steps = activeRecommendation.steps;
        return {
          ...prev,
          kpis: {
            ...prev.kpis,
            activeConflicts: Math.max(0, prev.kpis.activeConflicts - 1),
            avgDelaySavedMinutes:
              Math.round((prev.kpis.avgDelaySavedMinutes + activeRecommendation.delaySavedMinutes / 4) * 10) / 10,
            throughputEfficiencyPct:
              Math.round(
                Math.min(99.9, prev.kpis.throughputEfficiencyPct + activeRecommendation.throughputDeltaPct) * 10,
              ) / 10,
          },
          conflicts: prev.conflicts.map((c) =>
            c.id === activeConflict.id ? { ...c, resolved: true } : c,
          ),
          shadowBlocks: prev.shadowBlocks.map((sb) =>
            sb.sector === activeConflict.sector ? { ...sb, resolved: true } : sb,
          ),
          trains: prev.trains.map((t) => {
            const step = steps.find((s) => s.trainNumber === t.number);
            if (!step) return t;
            if (step.action.toLowerCase().includes("hold") || step.action.toLowerCase().includes("shunt")) {
              return { ...t, startSlot: t.startSlot + 2, status: "held" as const, delayMinutes: t.delayMinutes + 4 };
            }
            if (step.action.toLowerCase().includes("advance") || step.action.toLowerCase().includes("recover")) {
              return {
                ...t,
                startSlot: Math.max(0, t.startSlot - 1),
                status: "rerouted" as const,
                delayMinutes: Math.max(0, t.delayMinutes - 3),
              };
            }
            return { ...t, status: "on-time" as const };
          }),
        };
      });
      setApproving("done");
      pushLog(`Shadow-block conflict ${activeConflict.blockId} resolved — path locked`, "success");
      pushLog(`Engine recalculated corridor in ${activeRecommendation.computeMs}ms`, "info");
      setTimeout(() => setApproving("idle"), 1800);
    }, 900);
  };

  const handleReject = (reason: string) => {
    if (!schedule || !activeConflict || !activeRecommendation) return;
    pushLog(`Controller REJECTED plan ${activeRecommendation.id} for ${activeConflict.code}: ${reason}`, "warn");
    setSchedule((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        conflicts: prev.conflicts.map((c) =>
          c.id === activeConflict.id ? { ...c, resolved: true } : c,
        ),
      };
    });
  };

  const handleOverride = () => {
    pushLog("Manual override requested — controller assumes path authority", "warn");
    setSimulation("Manual adjust armed. Drag a train block on the track view to stage a new path.");
  };

  const handleSimulate = () => {
    if (!activeRecommendation) return;
    pushLog(`Impact simulation run for ${activeRecommendation.id}`, "info");
    setSimulation(
      `Simulated: ${activeRecommendation.delaySavedMinutes.toFixed(1)}m net delay saved, ${activeRecommendation.throughputDeltaPct.toFixed(1)}% throughput gain, 0 knock-on conflicts within 4h horizon.`,
    );
  };

  const windowLabel = useMemo(() => {
    const hours = -1 + (windowOffset / 100) * 5;
    if (Math.abs(hours) < 0.1) return "Now";
    return hours < 0 ? `${Math.abs(hours).toFixed(1)}h ago` : `+${hours.toFixed(1)}h projected`;
  }, [windowOffset]);

  return (
    <div className="flex min-h-screen flex-col dark">
      <TopBar
        kpis={
          schedule?.kpis ?? {
            trainsMonitored: 0,
            activeConflicts: 0,
            avgDelaySavedMinutes: 0,
            throughputEfficiencyPct: 0,
          }
        }
      />

      <main className="grid flex-1 gap-4 px-5 py-4 lg:grid-cols-5">
        {/* Left: track view */}
        <section className="space-y-3 lg:col-span-3">
          <div className="panel-surface flex flex-wrap items-center gap-4 px-4 py-3">
            <Select value={corridorId} onValueChange={setCorridorId}>
              <SelectTrigger className="w-[15rem] bg-background/60">
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

            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                pushLog("Demo Mode Initiated", "info");
                setCorridorId(CORRIDORS[0]!.id);
                setWindowOffset(30);
              }}
              className="h-9 border-suburban/30 bg-suburban/10 text-suburban hover:bg-suburban/20"
            >
              Demo Mode
            </Button>

            <div className="flex min-w-56 flex-1 items-center gap-3">
              <Gauge className="size-4 shrink-0 text-muted-foreground" />
              <Slider
                value={[windowOffset]}
                onValueChange={(v) => setWindowOffset(v[0] ?? 0)}
                max={100}
                step={1}
                className="flex-1"
              />
              <span className="num w-28 shrink-0 text-right text-[11px] text-muted-foreground">
                {windowLabel}
              </span>
            </div>
          </div>

          <TrackView
            sectors={corridor.sectors}
            trains={schedule?.trains ?? []}
            shadowBlocks={schedule?.shadowBlocks ?? []}
            windowOffset={windowOffset}
            selectedTrain={selectedTrain}
            onSelectTrain={setSelectedTrain}
          />
        </section>

        {/* Right: decision panel */}
        <section className="flex min-h-0 flex-col gap-3 lg:col-span-2 lg:max-h-[calc(100vh-16rem)]">
          <DecisionPanel
            conflict={activeConflict}
            recommendation={activeRecommendation}
            approving={approving}
            onApprove={handleApprove}
            onReject={handleReject}
            onOverride={handleOverride}
            onSimulate={handleSimulate}
            simulation={simulation}
          />
          <LogStream logs={logs} />
        </section>
      </main>

      <DebugDrawer open={debugOpen} onToggle={() => setDebugOpen((v) => !v)} payload={schedule} />
    </div>
  );
}
