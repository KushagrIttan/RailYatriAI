import type {
  BackendReplayOptimizationResult,
  BackendScheduledBlock,
  Conflict,
  Corridor,
  LogEntry,
  OptimizationSchedule,
  PlanningHorizon,
  ShadowBlock,
} from "./types";
import { ApiError } from "./types";

// ─── Config ──────────────────────────────────────────────────────────────────

/** Vite proxies /api → http://localhost:5053 in dev (see vite.config.ts). */
const GENERATE_ENDPOINT = "/api/optimization/generate";

export const HORIZON_DAYS: Record<PlanningHorizon, number> = {
  daily: 1,
  weekly: 7,
  monthly: 30,
};

export const HORIZON_LABELS: Record<PlanningHorizon, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
};

// ─── Corridor definitions ────────────────────────────────────────────────────
// These describe the corridor *structure* (which track sections exist), not
// operational data. They are stable configuration, not mock data.

export const CORRIDORS: Corridor[] = [
  {
    id: "DLI-GZB",
    label: "DLI → GZB (Delhi Junction – Ghaziabad)",
    sectors: ["DLI-GZB-DN"],
  },
];

export const SLOT_COUNT = 28; // 7 hours × 4 slots/hour (15 min each)

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Extract the day index from a block id like "RPL-CASE-001-d2" or
 * "RPL-CASE-001-d2-DEFERRED". Falls back to 0.
 */
export function blockDayIndex(blockId: string): number {
  const match = /-d(\d+)(?:-DEFERRED)?$/.exec(blockId);
  return match ? Number(match[1]) : 0;
}

/** Filter backend blocks to those belonging to a specific planning day. */
export function blocksForDay(
  blocks: BackendScheduledBlock[],
  dayIndex: number,
): BackendScheduledBlock[] {
  return blocks.filter((b) => blockDayIndex(b.blockId) === dayIndex);
}

/** Map a day-filtered block list to UI shadow blocks (patch over a plan). */
export function blocksToShadowBlocks(blocks: BackendScheduledBlock[]): ShadowBlock[] {
  return blocks
    .filter((b) => b.status === "Scheduled" || b.status === "Shadow Block")
    .map((b, i) => blockToShadowBlock(b, i));
}

/** Map a day-filtered block list to UI conflicts/decisions. */
export function blocksToConflicts(blocks: BackendScheduledBlock[]): Conflict[] {
  return blocks.map(blockToConflict);
}

/**
 * Map a list of backend ScheduledBlocks to UI ShadowBlocks.
 * The replay planning horizon begins at 08:00 and uses 15-minute slots.
 */
function blockToShadowBlock(block: BackendScheduledBlock, index: number): ShadowBlock {
  const isScheduled = block.status === "Scheduled" || block.status === "Shadow Block";
  let startSlot = 0;
  let span = Math.max(1, Math.ceil(block.durationMinutes / 15));
  let status: "scheduled" | "blocked" | "deferred" = "scheduled";
  let blockingTrainNumbers: string[] = [];
  let customLabel = `${block.department} work`;

  if (isScheduled && block.scheduledStart && !block.scheduledStart.startsWith("0001")) {
    const start = new Date(block.scheduledStart);
    const windowAnchorHour = 8;
    const minutesSinceAnchor =
      ((start.getHours() - windowAnchorHour + 24) % 24) * 60 + start.getMinutes();
    startSlot = Math.max(0, Math.min(SLOT_COUNT - 1, Math.floor(minutesSinceAnchor / 15)));
    status = "scheduled";
    customLabel = block.taskId === "CASE-OHE-001" ? "OHE Wire Defect (Approved)" : `${block.department} (Scheduled)`;
  } else if (block.taskId === "CASE-SIGNAL-001") {
    startSlot = 4; // 09:00 morning peak
    span = 3;
    status = "blocked";
    blockingTrainNumbers = ["64152", "64414"];
    customLabel = "Signal & Telecom (Blocked)";
  } else if (block.taskId === "CASE-TRACK-001") {
    startSlot = 8; // 10:00
    span = 4;
    status = "deferred";
    blockingTrainNumbers = ["04942", "64404"];
    customLabel = "Track Engineering (Deferred)";
  } else {
    startSlot = Math.min(SLOT_COUNT - span, 4 + index * 4);
    status = block.status === "Conflict Detected" ? "blocked" : "deferred";
    customLabel = `${block.department} (${block.status})`;
  }

  return {
    id: block.blockId ?? `sb-${index}`,
    conflictId: `case-${block.taskId}`,
    sector: block.trackSection,
    startSlot,
    span,
    severity: block.criticalityScore >= 0.8 ? "critical" : "warning",
    status,
    probability: block.criticalityScore,
    label: customLabel,
    department: block.department,
    conflictReason: block.conflictReason ?? undefined,
    blockingTrainNumbers,
    resolved: false,
    dayIndex: blockDayIndex(block.blockId),
  };
}

/**
 * Map each replay case to an access decision in the UI queue.
 */
function blockToConflict(block: BackendScheduledBlock): Conflict {
  const detectedAt = new Date().toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  return {
    id: `case-${block.blockId}`,
    code: "Maintenance request",
    blockId: block.blockId,
    sector: block.trackSection,
    trainA: "—",
    trainB: "—",
    detectedAt,
    etaMinutes: 0,
    severity: block.criticalityScore >= 0.8 ? "critical" : "warning",
    description: block.conflictReason ?? `Review the suggested maintenance time and safety requirements.`,
    resolved: false,
    dayIndex: blockDayIndex(block.blockId),
  };
}

// ─── Main fetch ───────────────────────────────────────────────────────────────

/**
 * Call the .NET backend, run the Python optimizer, and map the result to the
 * frontend UI shape.
 *
 * Throws `ApiError` on any failure — the caller is responsible for showing
 * the error to the user. No mock data fallback.
 */
export async function fetchOptimizationSchedule(
  corridorId: string,
  horizon: PlanningHorizon = "daily",
  days?: number,
): Promise<OptimizationSchedule> {
  let response: Response;

  const params = new URLSearchParams({ horizon });
  params.set("days", String(days ?? HORIZON_DAYS[horizon]));
  const endpoint = `${GENERATE_ENDPOINT}?${params.toString()}`;

  try {
    response = await fetch(endpoint, { method: "POST" });
  } catch (networkErr) {
    throw new ApiError(
      "Cannot reach the backend. Make sure the .NET API is running on port 5053.",
      null,
      String(networkErr),
    );
  }

  if (!response.ok) {
    let detail = "";
    try {
      detail = await response.text();
    } catch {
      /* ignore */
    }

    // Surface the specific messages set in OptimizationController
    throw new ApiError(
      `Backend returned ${response.status}: ${response.statusText}`,
      response.status,
      detail,
    );
  }

  let apiResult: BackendReplayOptimizationResult;
  try {
    apiResult = (await response.json()) as BackendReplayOptimizationResult;
  } catch (parseErr) {
    throw new ApiError(
      "Received a response from the backend but could not parse it as JSON.",
      response.status,
      String(parseErr),
    );
  }

  if (!apiResult.replayContext || apiResult.mode !== "replay") {
    throw new ApiError(
      "The backend is still serving the previous planner response.",
      response.status,
      "Restart the .NET API and Python optimisation service so they load the replay implementation.",
    );
  }

  // ── Map backend result → UI shape ──────────────────────────────────────────

  const schedule = apiResult.schedule ?? [];

  const shadowBlocks: ShadowBlock[] = schedule.map((b, i) => blockToShadowBlock(b, i));

  const conflicts: Conflict[] = schedule.map(blockToConflict);

  const planningStart = new Date(apiResult.replayContext.planningStart).getTime();
  const trains = apiResult.trainMovements.map((movement) => {
    const start = new Date(movement.scheduledEntry).getTime();
    const end = new Date(movement.scheduledExit).getTime();
    const sourceClass = movement.trainClass.toLowerCase();
    return {
      id: movement.id,
      number: movement.number,
      name: movement.name,
      trainClass: sourceClass.includes("express") ? "express" as const : "suburban" as const,
      priority: sourceClass.includes("express") ? 2 : 1,
      status: "on-time" as const,
      delayMinutes: 0,
      startSlot: Math.max(0, Math.floor((start - planningStart) / 900000)),
      span: Math.max(1, Math.ceil((end - start) / 900000)),
      sector: movement.sectionId,
      speedKph: 0,
    };
  });

  const planningEnd = new Date(apiResult.replayContext.planningEnd).getTime();
  const horizonMinutes = Math.max(1, (planningEnd - planningStart) / 60000);
  const usableMinutes = apiResult.windowCandidates.reduce((sum, window) => sum + window.usableMinutes, 0);
  const throughputPct = Math.round((usableMinutes / horizonMinutes) * 1000) / 10;

  return {
    engine: "Timetable Replay Planner",
    version: "Replay V1",
    generatedAt: new Date().toISOString(),
    corridor: corridorId,
    kpis: {
      trainsMonitored: apiResult.totalTasks,
      activeConflicts: conflicts.length,
      avgDelaySavedMinutes: 0,
      throughputEfficiencyPct: throughputPct,
    },
    trains,
    shadowBlocks,
    conflicts,
    recommendations: apiResult.recommendations ?? [],
    replayContext: apiResult.replayContext,
    horizon: apiResult.horizon,
    planningDays: apiResult.planningDays,
    dayBreakdown: apiResult.dayBreakdown ?? [],
    blocks: schedule,
    mlStats: apiResult.mlStats ?? null,
    triage: apiResult.triage ?? null,
  };
}

// ─── Log helpers ─────────────────────────────────────────────────────────────

let logSeq = 0;

export function makeLog(message: string, level: LogEntry["level"] = "info"): LogEntry {
  logSeq += 1;
  const now = new Date();
  const time = [now.getHours(), now.getMinutes(), now.getSeconds()]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
  return { id: `log-${logSeq}-${now.getTime()}`, time, level, message };
}

export const AMBIENT_LOG_MESSAGES: { message: string; level: LogEntry["level"] }[] = [
  { message: "Saved timetable scenario loaded", level: "info" },
  { message: "Checking gaps between scheduled trains", level: "info" },
  { message: "Applying simulated maintenance safety requirements", level: "success" },
  { message: "This workspace does not use live railway telemetry", level: "warn" },
];
