import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Gauge, RefreshCw, ServerCrash } from "lucide-react";
import { TopBar } from "@/components/railblock/TopBar";
import { TrackView } from "@/components/railblock/TrackView";
import { DecisionPanel } from "@/components/railblock/DecisionPanel";
import { LogStream } from "@/components/railblock/LogStream";
import { DebugDrawer } from "@/components/railblock/DebugDrawer";
import { WorkQueue } from "@/components/railblock/WorkQueue";
import { PlanningGuide } from "@/components/railblock/PlanningGuide";
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
import { ApiError } from "@/lib/railblock/types";
import type { LogEntry, OptimizationSchedule } from "@/lib/railblock/types";

export default function App() {
  const [corridorId, setCorridorId] = useState(CORRIDORS[0]!.id);
  const [schedule, setSchedule] = useState<OptimizationSchedule | null>(null);
  const [fetchError, setFetchError] = useState<{ title: string; detail: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [windowOffset, setWindowOffset] = useState(20);
  const [selectedTrain, setSelectedTrain] = useState<string | null>(null);
  const [selectedConflictId, setSelectedConflictId] = useState<string | null>(null);
  const [approving, setApproving] = useState<"idle" | "working" | "done">("idle");
  const [simulation, setSimulation] = useState<string | null>(null);
  const [debugOpen, setDebugOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);

  // Keep a ref to the ambient log interval so we can clear it on error
  const ambientRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const pushLog = useCallback((message: string, level: LogEntry["level"] = "info") => {
    setLogs((prev) => [...prev.slice(-80), makeLog(message, level)]);
  }, []);

  // ── Fetch schedule ────────────────────────────────────────────────────────

  const loadSchedule = useCallback(
    async (id: string, cancelled: { value: boolean }) => {
      setLoading(true);
      setFetchError(null);
      setSchedule(null);
      pushLog("Preparing the saved timetable scenario…", "info");

      try {
        const data = await fetchOptimizationSchedule(id);
        if (cancelled.value) return;

        setSchedule(data);
        pushLog(
          `Plan ready — ${data.kpis.trainsMonitored} maintenance requests reviewed.`,
          "success",
        );
        if (data.conflicts.length > 0) {
          pushLog(`${data.conflicts.length} maintenance request(s) are ready for review.`, "warn");
        }
      } catch (err) {
        if (cancelled.value) return;

        // Stop ambient noise — it's misleading when the backend is down
        if (ambientRef.current !== null) {
          clearInterval(ambientRef.current);
          ambientRef.current = null;
        }

        if (err instanceof ApiError) {
          pushLog(`Error: ${err.message}`, "error");
          setFetchError({ title: err.message, detail: err.detail });
        } else {
          const msg = err instanceof Error ? err.message : String(err);
          pushLog(`Unexpected error: ${msg}`, "error");
          setFetchError({ title: "Unexpected error", detail: msg });
        }
      } finally {
        if (!cancelled.value) setLoading(false);
      }
    },
    [pushLog],
  );

  useEffect(() => {
    const cancelled = { value: false };
    setApproving("idle");
    setSimulation(null);
    setSelectedConflictId(null);
    void loadSchedule(corridorId, cancelled);
    return () => {
      cancelled.value = true;
    };
  }, [corridorId, loadSchedule]);

  // ── Ambient log ticker (only when healthy) ────────────────────────────────

  useEffect(() => {
    // Don't start the ticker if there's already an error
    if (fetchError) return;

    ambientRef.current = setInterval(() => {
      const pick = AMBIENT_LOG_MESSAGES[Math.floor(Math.random() * AMBIENT_LOG_MESSAGES.length)]!;
      pushLog(pick.message, pick.level);
    }, 5200);

    return () => {
      if (ambientRef.current !== null) clearInterval(ambientRef.current);
    };
  }, [pushLog, fetchError]);

  // ── Derived state ─────────────────────────────────────────────────────────

  const corridor = useMemo(
    () => CORRIDORS.find((c) => c.id === corridorId) ?? CORRIDORS[0]!,
    [corridorId],
  );

  const activeConflict =
    schedule?.conflicts.find((c) => c.id === selectedConflictId && !c.resolved) ??
    schedule?.conflicts.find((c) => !c.resolved) ??
    null;
  const activeRecommendation =
    schedule?.recommendations.find((r) => r.conflictId === activeConflict?.id) ?? null;

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleApprove = () => {
    if (!schedule || !activeConflict || !activeRecommendation) return;
    setApproving("working");
    pushLog("Suggested maintenance plan accepted for this prototype scenario.", "info");

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
              Math.round(
                (prev.kpis.avgDelaySavedMinutes + activeRecommendation.delaySavedMinutes / 4) * 10,
              ) / 10,
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
      pushLog("Maintenance decision recorded in this prototype scenario.", "success");
      pushLog("Suggested plan refreshed.", "info");
      setTimeout(() => setApproving("idle"), 1800);
    }, 900);
  };

  const handleReject = (reason: string) => {
    if (!schedule || !activeConflict || !activeRecommendation) return;
    pushLog(`Suggested maintenance plan rejected: ${reason}`, "warn");
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
    pushLog("Manual adjustment requested for this prototype scenario.", "warn");
    setSimulation("Manual adjustments are recorded for discussion only; they do not change real railway operations.");
  };

  const handleSimulate = () => {
    if (!activeRecommendation) return;
    pushLog("Checking the suggested plan against the saved timetable…", "info");
    setSimulation(
      `Scenario result: estimated disruption avoided ${activeRecommendation.delaySavedMinutes.toFixed(1)} minutes; ` +
        `${activeRecommendation.throughputDeltaPct.toFixed(1)}% more timetable space in this saved scenario.`,
    );
  };

  const windowLabel = useMemo(() => {
    const hours = -1 + (windowOffset / 100) * 5;
    if (Math.abs(hours) < 0.1) return "Now";
    return hours < 0 ? `${Math.abs(hours).toFixed(1)}h ago` : `+${hours.toFixed(1)}h projected`;
  }, [windowOffset]);

  // ── Render ────────────────────────────────────────────────────────────────

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
        onOpenGuide={() => setGuideOpen(true)}
        replayContext={schedule?.replayContext}
      />

      {/* ── Error banner ──────────────────────────────────────────────────── */}
      {fetchError && (
        <div
          role="alert"
          className="mx-4 mt-4 flex flex-col gap-3 rounded-lg border border-destructive/50 bg-destructive/10 px-5 py-4"
        >
          <div className="flex items-start gap-3">
            <ServerCrash className="mt-0.5 size-5 shrink-0 text-destructive" />
            <div className="flex-1 space-y-1">
              <p className="text-sm font-semibold text-destructive">{fetchError.title}</p>
              {fetchError.detail && (
                <p className="text-xs text-destructive/80 break-words">{fetchError.detail}</p>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                Check that both services are running:
              </p>
              <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground font-mono">
                <li>
                  <span className="text-foreground/60">1.</span>{" "}
                  <span className="text-foreground/80">cd backend/RailBlockAI.Api &amp;&amp; dotnet run --launch-profile http</span>
                </li>
                <li>
                  <span className="text-foreground/60">2.</span>{" "}
                  <span className="text-foreground/80">cd backend &amp;&amp; venv/bin/python optimization-engine/main.py</span>
                </li>
              </ul>
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={loading}
              onClick={() => {
                const cancelled = { value: false };
                void loadSchedule(corridorId, cancelled);
              }}
              className="shrink-0 gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10"
            >
              <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
              Retry
            </Button>
          </div>
        </div>
      )}

      {/* ── Loading state ─────────────────────────────────────────────────── */}
      {loading && !fetchError && (
        <div className="mx-4 mt-4 flex items-center gap-3 rounded-lg border border-border bg-background/50 px-5 py-3">
          <RefreshCw className="size-4 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Preparing the saved timetable scenario…
          </p>
        </div>
      )}

      <main className="grid flex-1 gap-4 px-5 py-4 xl:grid-cols-[18rem_minmax(0,1fr)_25rem]">
        <section className="space-y-3 xl:col-start-2">
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

            {/* Retry / Refresh button replaces the old "Load sample plan" */}
            <Button
              variant="outline"
              size="sm"
              disabled={loading}
              onClick={() => {
                const cancelled = { value: false };
                void loadSchedule(corridorId, cancelled);
              }}
              className="h-9 gap-1.5"
            >
              <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
              {loading ? "Loading…" : "Refresh"}
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

          {/* Show a subtle warning strip on the track view when errored */}
          {fetchError ? (
            <div className="panel-surface flex items-center justify-center gap-3 py-16 text-muted-foreground">
              <AlertTriangle className="size-5 text-destructive/60" />
              <p className="text-sm">Track view unavailable — no schedule data.</p>
            </div>
          ) : (
            <TrackView
              sectors={corridor.sectors}
              trains={schedule?.trains ?? []}
              shadowBlocks={schedule?.shadowBlocks ?? []}
              windowOffset={windowOffset}
              selectedTrain={selectedTrain}
              onSelectTrain={setSelectedTrain}
            />
          )}
        </section>

        <section className="xl:col-start-1 xl:row-start-1">
          <WorkQueue
            conflicts={schedule?.conflicts ?? []}
            recommendations={schedule?.recommendations ?? []}
            selectedId={activeConflict?.id ?? null}
            onSelect={setSelectedConflictId}
            onOpenGuide={() => setGuideOpen(true)}
          />
        </section>

        <section className="flex min-h-0 flex-col gap-3 xl:col-start-3 xl:row-start-1 xl:max-h-[calc(100vh-15rem)]">
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
      <PlanningGuide open={guideOpen} onOpenChange={setGuideOpen} />
    </div>
  );
}
