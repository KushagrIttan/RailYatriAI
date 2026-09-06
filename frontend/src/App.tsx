import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, RefreshCw, ServerCrash } from "lucide-react";
import { Sidebar } from "@/components/railblock/Sidebar";
import { TopBar } from "@/components/railblock/TopBar";
import { TrackView } from "@/components/railblock/TrackView";
import { DecisionPanel } from "@/components/railblock/DecisionPanel";
import { LogStream } from "@/components/railblock/LogStream";
import { MlStatsPanel } from "@/components/railblock/MlStatsPanel";
import { WorkQueue } from "@/components/railblock/WorkQueue";
import { DebugDrawer } from "@/components/railblock/DebugDrawer";
import { PlanningGuide } from "@/components/railblock/PlanningGuide";
import { Button } from "@/components/ui/button";
import {
  AMBIENT_LOG_MESSAGES,
  CORRIDORS,
  HORIZON_DAYS,
  HORIZON_LABELS,
  fetchOptimizationSchedule,
  makeLog,
} from "@/lib/railblock/service";
import { ApiError } from "@/lib/railblock/types";
import type { LogEntry, OptimizationSchedule, PlanningHorizon } from "@/lib/railblock/types";

export default function App() {
  const [corridorId, setCorridorId] = useState(CORRIDORS[0]!.id);
  const [horizon, setHorizon] = useState<PlanningHorizon>("daily");
  const [selectedDay, setSelectedDay] = useState(0);
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
  const [approvedCount, setApprovedCount] = useState(0);

  const ambientRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const pushLog = useCallback((message: string, level: LogEntry["level"] = "info") => {
    setLogs((prev) => [...prev.slice(-80), makeLog(message, level)]);
  }, []);

  const loadSchedule = useCallback(
    async (id: string, hz: PlanningHorizon, cancelled: { value: boolean }) => {
      setLoading(true);
      setFetchError(null);
      setSchedule(null);
      pushLog(`Preparing the saved timetable scenario (${HORIZON_LABELS[hz]} plan)…`, "info");
      try {
        const data = await fetchOptimizationSchedule(id, hz, HORIZON_DAYS[hz]);
        if (cancelled.value) return;
        setSchedule(data);
        pushLog(`Plan ready — ${data.kpis.trainsMonitored} maintenance requests reviewed.`, "success");
        if (data.mlStats?.active) {
          const s = data.mlStats;
          pushLog(
            `ML prioritizer ranked ${s.scoredByModel} case(s) — mean risk ${s.scoreMean.toFixed(2)}, ` +
            `${s.scheduledHighRisk} high-risk scheduled.`,
            "info",
          );
        } else if (data.mlStats) {
          pushLog("ML model inactive — using heuristic fallback ranking.", "warn");
        }
        if (data.conflicts.length > 0) {
          pushLog(`${data.conflicts.length} maintenance request(s) ready for review.`, "warn");
        }
      } catch (err) {
        if (cancelled.value) return;
        if (ambientRef.current !== null) { clearInterval(ambientRef.current); ambientRef.current = null; }
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
    setSelectedDay(0);
    setApprovedCount(0);
    void loadSchedule(corridorId, horizon, cancelled);
    return () => { cancelled.value = true; };
  }, [corridorId, horizon, loadSchedule]);

  useEffect(() => {
    if (fetchError) return;
    ambientRef.current = setInterval(() => {
      const pick = AMBIENT_LOG_MESSAGES[Math.floor(Math.random() * AMBIENT_LOG_MESSAGES.length)]!;
      pushLog(pick.message, pick.level);
    }, 5200);
    return () => { if (ambientRef.current !== null) clearInterval(ambientRef.current); };
  }, [pushLog, fetchError]);

  const corridor = useMemo(
    () => CORRIDORS.find((c) => c.id === corridorId) ?? CORRIDORS[0]!,
    [corridorId],
  );

  // Day-scoped view: the backend returns all days' decisions for the horizon;
  // the UI shows the selected planning day while keeping resolve state global.
  const dayBreakdown = schedule?.dayBreakdown ?? [];
  const clampedDay = Math.min(selectedDay, Math.max(0, dayBreakdown.length - 1));
  const displayConflicts = (schedule?.conflicts ?? []).filter((c) => c.dayIndex === clampedDay);
  const displayShadowBlocks = (schedule?.shadowBlocks ?? []).filter(
    (sb) => sb.dayIndex === clampedDay,
  );

  const activeConflict =
    displayConflicts.find((c) => c.id === selectedConflictId && !c.resolved) ??
    displayConflicts.find((c) => !c.resolved) ??
    null;
  const activeRecommendation =
    schedule?.recommendations.find((r) => r.conflictId === activeConflict?.id) ?? null;

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
            avgDelaySavedMinutes: Math.round((prev.kpis.avgDelaySavedMinutes + activeRecommendation.delaySavedMinutes / 4) * 10) / 10,
            throughputEfficiencyPct: Math.round(Math.min(99.9, prev.kpis.throughputEfficiencyPct + activeRecommendation.throughputDeltaPct) * 10) / 10,
          },
          conflicts: prev.conflicts.map((c) =>
            c.id === activeConflict.id ? { ...c, resolved: true } : c,
          ),
          shadowBlocks: prev.shadowBlocks.map((sb) =>
            sb.id === activeConflict.blockId ? { ...sb, resolved: true } : sb,
          ),
          trains: prev.trains.map((t) => {
            const step = steps.find((s) => s.trainNumber === t.number);
            if (!step) return t;
            if (step.action.toLowerCase().includes("hold") || step.action.toLowerCase().includes("shunt")) {
              return { ...t, startSlot: t.startSlot + 2, status: "held" as const, delayMinutes: t.delayMinutes + 4 };
            }
            if (step.action.toLowerCase().includes("advance") || step.action.toLowerCase().includes("recover")) {
              return { ...t, startSlot: Math.max(0, t.startSlot - 1), status: "rerouted" as const, delayMinutes: Math.max(0, t.delayMinutes - 3) };
            }
            return { ...t, status: "on-time" as const };
          }),
        };
      });
      setApproving("done");
      setApprovedCount((c) => c + 1);
      const mlFeed = schedule?.mlStats?.decisionFeed.find(
        (f) => f.blockId === activeConflict.blockId,
      );
      pushLog(
        mlFeed
          ? `Maintenance decision recorded — ML risk ${mlFeed.mlScore.toFixed(2)} (${mlFeed.tier}).`
          : "Maintenance decision recorded in this prototype scenario.",
        "success",
      );
      setTimeout(() => setApproving("idle"), 1800);
    }, 900);
  };

  const handleReject = (reason: string) => {
    if (!schedule || !activeConflict) return;
    pushLog(`Suggested maintenance plan rejected: ${reason}`, "warn");
    setSchedule((prev) => {
      if (!prev) return prev;
      return { ...prev, conflicts: prev.conflicts.map((c) => c.id === activeConflict.id ? { ...c, resolved: true } : c) };
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

  const kpis = schedule?.kpis ?? {
    trainsMonitored: 0,
    activeConflicts: 0,
    avgDelaySavedMinutes: 0,
    throughputEfficiencyPct: 0,
  };

  return (
    /* Root: full viewport, horizontal flex */
    <div className="flex h-screen overflow-hidden bg-background">

      {/* ── Left sidebar (fixed width, full height) ── */}
      <Sidebar
        kpis={kpis}
        onOpenGuide={() => setGuideOpen(true)}
        replayContext={schedule?.replayContext}
      />

      {/* ── Right: everything else stacks vertically ── */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">

        {/* Slim top toolbar (never scrolls) */}
        <TopBar
          corridorId={corridorId}
          setCorridorId={setCorridorId}
          loading={loading}
          onRefresh={() => { const c = { value: false }; void loadSchedule(corridorId, horizon, c); }}
          windowOffset={windowOffset}
          setWindowOffset={setWindowOffset}
          windowLabel={windowLabel}
          onOpenGuide={() => setGuideOpen(true)}
        />

        {/* Scrollable page body */}
        <div className="flex-1 overflow-y-auto">

          {/* Hero gradient banner */}
          <div
            className="mx-6 mt-6 overflow-hidden rounded-xl"
            style={{
              background: "linear-gradient(135deg, #e0e7ff 0%, #ede9fe 38%, #fce7f3 72%, #fff1f2 100%)",
              height: "140px",
            }}
          >
            <div className="relative h-full w-full overflow-hidden">
              {/* Floating translucent card shapes (reference style) */}
              <div className="absolute left-[8%] top-[10%] h-20 w-28 rounded-2xl bg-white/30 rotate-12 blur-[1px]" />
              <div className="absolute left-[20%] top-[35%] h-14 w-20 rounded-xl bg-white/40 -rotate-6" />
              <div className="absolute left-[36%] top-[8%] h-18 w-24 rounded-2xl bg-purple-200/40 rotate-3" />
              <div className="absolute right-[18%] top-[15%] h-24 w-32 rounded-2xl bg-pink-200/35 -rotate-8 blur-[1.5px]" />
              <div className="absolute right-[6%] top-[30%] h-14 w-18 rounded-xl bg-white/30 rotate-12" />
              {/* Corridor title overlaid */}
              <div className="absolute bottom-5 left-6">
                <p className="text-[11px] font-medium uppercase tracking-widest text-indigo-700/50">Maintenance Planning</p>
                <h1 className="mt-0.5 text-xl font-bold tracking-tight text-indigo-900/75">
                  {corridor.label}
                </h1>
              </div>
            </div>
          </div>

          {/* Error banner */}
          {fetchError && (
            <div role="alert" className="mx-6 mt-4 flex flex-col gap-3 rounded-lg border border-red-200 bg-red-50 px-5 py-4">
              <div className="flex items-start gap-3">
                <ServerCrash className="mt-0.5 size-5 shrink-0 text-destructive" />
                <div className="flex-1 space-y-1">
                  <p className="text-sm font-semibold text-destructive">{fetchError.title}</p>
                  {fetchError.detail && <p className="text-xs text-destructive/70 break-words">{fetchError.detail}</p>}
                  <p className="text-xs text-muted-foreground mt-1">Check that both services are running:</p>
                  <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground font-mono">
                    <li>1. cd backend/RailBlockAI.Api &amp;&amp; dotnet run --launch-profile http</li>
                    <li>2. cd backend &amp;&amp; venv/bin/python optimization-engine/main.py</li>
                  </ul>
                </div>
                <Button size="sm" variant="outline" disabled={loading}
                  onClick={() => { const c = { value: false }; void loadSchedule(corridorId, horizon, c); }}
                  className="shrink-0 border-red-200 text-destructive hover:bg-red-50">
                  <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} /> Retry
                </Button>
              </div>
            </div>
          )}

          {/* Planning controls: horizon toggle + day selector */}
          {!fetchError && !loading && (
            <div className="mx-6 mt-4 flex flex-wrap items-center gap-3">
              <div className="flex overflow-hidden rounded-md border border-border bg-background/60">
                {(Object.keys(HORIZON_LABELS) as PlanningHorizon[]).map((hz) => (
                  <button
                    key={hz}
                    onClick={() => setHorizon(hz)}
                    className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                      horizon === hz
                        ? "bg-success/15 text-success"
                        : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                    }`}
                  >
                    {HORIZON_LABELS[hz]}
                  </button>
                ))}
              </div>

              {dayBreakdown.length > 1 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="mr-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                    Planning day
                  </span>
                  {dayBreakdown.map((day, i) => (
                    <button
                      key={day.date}
                      onClick={() => { setSelectedDay(i); setSelectedConflictId(null); setSimulation(null); }}
                      title={`${day.scheduled} scheduled · ${day.deferred} deferred · ${day.availabilityGainPct}% window used`}
                      className={`rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                        i === clampedDay
                          ? "border-success/50 bg-success/15 text-success"
                          : "border-border bg-background/50 text-muted-foreground hover:bg-accent/50"
                      }`}
                    >
                      {day.label}
                      <span className="ml-1.5 inline-flex items-center gap-1 text-[9px] opacity-80">
                        <span className="size-1.5 rounded-full bg-success/80" />
                        {day.scheduled}
                        {day.deferred > 0 && <span className="size-1.5 rounded-full bg-destructive/70" />}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Loading indicator */}
          {loading && !fetchError && (
            <div className="mx-6 mt-4 flex items-center gap-3 rounded-lg border border-border bg-white px-5 py-3">
              <RefreshCw className="size-4 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Preparing the saved timetable scenario…</p>
            </div>
          )}

          {/* TrackView */}
          <div className="mx-6 mt-5">
            {fetchError ? (
              <div className="panel-surface flex items-center justify-center gap-3 py-16 text-muted-foreground">
                <AlertTriangle className="size-5 text-destructive/60" />
                <p className="text-sm">Track view unavailable — no schedule data.</p>
              </div>
            ) : (
              <TrackView
                sectors={corridor.sectors}
                trains={schedule?.trains ?? []}
                shadowBlocks={displayShadowBlocks}
                windowOffset={windowOffset}
                selectedTrain={selectedTrain}
                onSelectTrain={setSelectedTrain}
                selectedConflictId={activeConflict?.id ?? null}
                onSelectConflict={setSelectedConflictId}
              />
            )}
          </div>

          {/* Live ML decision intelligence */}
          {!fetchError && schedule && (
            <div className="mx-6 mt-5">
              <MlStatsPanel
                stats={schedule.mlStats ?? null}
                approvedCount={approvedCount}
                pendingCount={displayConflicts.filter((c) => !c.resolved).length}
              />
            </div>
          )}

          {/* WorkQueue + DecisionPanel side by side */}
          <div className="mx-6 mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
            <WorkQueue
              conflicts={displayConflicts}
              recommendations={schedule?.recommendations ?? []}
              selectedId={activeConflict?.id ?? null}
              onSelect={setSelectedConflictId}
              onOpenGuide={() => setGuideOpen(true)}
            />
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
          </div>

          {/* Activity log */}
          <div className="mx-6 mt-5 pb-8">
            <LogStream logs={logs} />
          </div>

          {/* Debug drawer (sticky at bottom of scroll area) */}
          <DebugDrawer open={debugOpen} onToggle={() => setDebugOpen((v) => !v)} payload={schedule} />
        </div>
      </div>

      <PlanningGuide open={guideOpen} onOpenChange={setGuideOpen} />
    </div>
  );
}
