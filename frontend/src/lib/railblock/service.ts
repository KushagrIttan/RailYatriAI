import type {
  Conflict,
  Corridor,
  LogEntry,
  OptimizationSchedule,
  ScheduleRecommendation,
  ShadowBlock,
  Train,
} from "./types";

/**
 * Service layer for the optimization backend.
 *
 * Everything below is mock data. To go live, replace the body of
 * `fetchOptimizationSchedule` with a real request:
 *
 *   const res = await fetch(`${API_BASE}/api/optimization/schedule?corridor=${corridorId}`);
 *   return (await res.json()) as OptimizationSchedule;
 */
export const API_BASE = "";
export const SCHEDULE_ENDPOINT = "/api/optimization/schedule";

export const CORRIDORS: Corridor[] = [
  { id: "A1-D4", label: "Corridor A1 → D4 (Northern Main)", sectors: ["A1", "B2", "B12", "C3", "D4"] },
  { id: "E5-H8", label: "Corridor E5 → H8 (Docklands Freight)", sectors: ["E5", "F6", "G7", "H8"] },
  { id: "J1-L3", label: "Corridor J1 → L3 (Suburban Loop)", sectors: ["J1", "K2", "L3"] },
];

export const SLOT_COUNT = 20;

const TRAINS: Record<string, Train[]> = {
  "A1-D4": [
    { id: "t1", number: "12903", name: "Golden Temple Exp", trainClass: "express", priority: 1, status: "on-time", delayMinutes: 0, startSlot: 1, span: 4, sector: "A1", speedKph: 118 },
    { id: "t2", number: "8801", name: "Bulk Freight", trainClass: "freight", priority: 4, status: "delayed", delayMinutes: 12, startSlot: 5, span: 6, sector: "B2", speedKph: 62 },
    { id: "t3", number: "6644", name: "Suburban Shuttle", trainClass: "suburban", priority: 3, status: "on-time", delayMinutes: 0, startSlot: 2, span: 3, sector: "B12", speedKph: 84 },
    { id: "t4", number: "12045", name: "Shatabdi Link", trainClass: "express", priority: 1, status: "on-time", delayMinutes: 0, startSlot: 9, span: 4, sector: "B12", speedKph: 132 },
    { id: "t5", number: "9012", name: "Container Rake", trainClass: "freight", priority: 5, status: "held", delayMinutes: 21, startSlot: 6, span: 5, sector: "C3", speedKph: 48 },
    { id: "t6", number: "7710", name: "Metro Feeder", trainClass: "suburban", priority: 3, status: "on-time", delayMinutes: 2, startSlot: 12, span: 3, sector: "C3", speedKph: 78 },
    { id: "t7", number: "12511", name: "Coastal Express", trainClass: "express", priority: 2, status: "on-time", delayMinutes: 0, startSlot: 3, span: 5, sector: "D4", speedKph: 124 },
    { id: "t8", number: "8830", name: "Ore Freight", trainClass: "freight", priority: 4, status: "on-time", delayMinutes: 4, startSlot: 13, span: 6, sector: "A1", speedKph: 55 },
    { id: "t9", number: "6688", name: "Local 6688", trainClass: "suburban", priority: 3, status: "on-time", delayMinutes: 0, startSlot: 14, span: 3, sector: "D4", speedKph: 80 },
    { id: "t10", number: "8842", name: "Tanker Freight", trainClass: "freight", priority: 5, status: "delayed", delayMinutes: 9, startSlot: 15, span: 4, sector: "B2", speedKph: 51 },
  ],
  "E5-H8": [
    { id: "f1", number: "8901", name: "Dock Freight", trainClass: "freight", priority: 4, status: "on-time", delayMinutes: 0, startSlot: 2, span: 6, sector: "E5", speedKph: 58 },
    { id: "f2", number: "8905", name: "Reefer Rake", trainClass: "freight", priority: 5, status: "delayed", delayMinutes: 7, startSlot: 9, span: 5, sector: "F6", speedKph: 44 },
    { id: "f3", number: "12210", name: "Port Express", trainClass: "express", priority: 2, status: "on-time", delayMinutes: 0, startSlot: 4, span: 4, sector: "G7", speedKph: 121 },
    { id: "f4", number: "6602", name: "Harbour Local", trainClass: "suburban", priority: 3, status: "on-time", delayMinutes: 1, startSlot: 11, span: 3, sector: "H8", speedKph: 76 },
  ],
  "J1-L3": [
    { id: "s1", number: "6701", name: "Loop Local A", trainClass: "suburban", priority: 3, status: "on-time", delayMinutes: 0, startSlot: 1, span: 3, sector: "J1", speedKph: 82 },
    { id: "s2", number: "6702", name: "Loop Local B", trainClass: "suburban", priority: 3, status: "on-time", delayMinutes: 0, startSlot: 6, span: 3, sector: "K2", speedKph: 79 },
    { id: "s3", number: "12088", name: "Intercity Link", trainClass: "express", priority: 1, status: "delayed", delayMinutes: 5, startSlot: 8, span: 4, sector: "L3", speedKph: 128 },
  ],
};

const SHADOW_BLOCKS: Record<string, ShadowBlock[]> = {
  "A1-D4": [
    { id: "sb1", sector: "B12", startSlot: 9, span: 3, severity: "critical", probability: 0.91, label: "Shadow B-12", resolved: false },
    { id: "sb2", sector: "C3", startSlot: 6, span: 2, severity: "warning", probability: 0.64, label: "Shadow C-03", resolved: false },
  ],
  "E5-H8": [
    { id: "sb3", sector: "F6", startSlot: 9, span: 3, severity: "warning", probability: 0.58, label: "Shadow F-06", resolved: false },
  ],
  "J1-L3": [
    { id: "sb4", sector: "L3", startSlot: 8, span: 2, severity: "warning", probability: 0.42, label: "Shadow L-03", resolved: false },
  ],
};

const CONFLICTS: Record<string, Conflict[]> = {
  "A1-D4": [
    {
      id: "c104",
      code: "Conflict #104",
      blockId: "B-12",
      sector: "B12",
      trainA: "12903",
      trainB: "8801",
      detectedAt: "17:09:41",
      etaMinutes: 6,
      severity: "critical",
      description:
        "Express 12903 will overtake Freight 8801 inside single-line block B-12. Predicted headway violation of 82 seconds.",
      resolved: false,
    },
    {
      id: "c105",
      code: "Conflict #105",
      blockId: "C-03",
      sector: "C3",
      trainA: "9012",
      trainB: "7710",
      detectedAt: "17:11:07",
      etaMinutes: 18,
      severity: "warning",
      description:
        "Held container rake 9012 blocks the platform road as suburban 7710 arrives. Dwell overlap of 3.4 minutes.",
      resolved: false,
    },
  ],
  "E5-H8": [
    {
      id: "c211",
      code: "Conflict #211",
      blockId: "F-06",
      sector: "F6",
      trainA: "8905",
      trainB: "12210",
      detectedAt: "17:08:12",
      etaMinutes: 22,
      severity: "warning",
      description: "Reefer rake 8905 fouls the express path at loop F-06 during the 17:35 window.",
      resolved: false,
    },
  ],
  "J1-L3": [
    {
      id: "c318",
      code: "Conflict #318",
      blockId: "L-03",
      sector: "L3",
      trainA: "12088",
      trainB: "6702",
      detectedAt: "17:12:55",
      etaMinutes: 27,
      severity: "warning",
      description: "Intercity 12088 catches suburban 6702 on the shared approach to L-03.",
      resolved: false,
    },
  ],
};

const RECOMMENDATIONS: Record<string, ScheduleRecommendation[]> = {
  "A1-D4": [
    {
      id: "r104",
      conflictId: "c104",
      strategy: "Shadow-block pre-emption + loop hold",
      confidence: 0.96,
      delaySavedMinutes: 14.8,
      throughputDeltaPct: 3.1,
      computeMs: 12,
      steps: [
        { trainNumber: "8801", action: "Hold in loop B-11", detail: "Dwell 4m 10s, release at 17:24:30" },
        { trainNumber: "12903", action: "Clear priority path", detail: "Maintain 118 kph through B-12" },
        { trainNumber: "6644", action: "Advance 90s", detail: "Absorbs downstream platform slack at B-12" },
      ],
    },
    {
      id: "r105",
      conflictId: "c105",
      strategy: "Platform reassignment",
      confidence: 0.88,
      delaySavedMinutes: 6.2,
      throughputDeltaPct: 1.4,
      computeMs: 9,
      steps: [
        { trainNumber: "9012", action: "Shunt to siding C-3B", detail: "Frees platform road at 17:31" },
        { trainNumber: "7710", action: "Arrive platform 2", detail: "No dwell penalty" },
      ],
    },
  ],
  "E5-H8": [
    {
      id: "r211",
      conflictId: "c211",
      strategy: "Freight regulation window",
      confidence: 0.91,
      delaySavedMinutes: 8.4,
      throughputDeltaPct: 2.2,
      computeMs: 11,
      steps: [
        { trainNumber: "8905", action: "Hold at F-05", detail: "Release behind express, 3m 20s dwell" },
        { trainNumber: "12210", action: "Unchanged path", detail: "Clears F-06 at 17:38" },
      ],
    },
  ],
  "J1-L3": [
    {
      id: "r318",
      conflictId: "c318",
      strategy: "Suburban step-aside",
      confidence: 0.83,
      delaySavedMinutes: 4.6,
      throughputDeltaPct: 0.9,
      computeMs: 8,
      steps: [
        { trainNumber: "6702", action: "Step aside at K-2", detail: "Dwell 2m, then follow" },
        { trainNumber: "12088", action: "Recover 5m delay", detail: "Line speed 128 kph to L-3" },
      ],
    },
  ],
};

const KPIS: Record<string, OptimizationSchedule["kpis"]> = {
  "A1-D4": { trainsMonitored: 24, activeConflicts: 2, avgDelaySavedMinutes: 14.8, throughputEfficiencyPct: 94.2 },
  "E5-H8": { trainsMonitored: 16, activeConflicts: 1, avgDelaySavedMinutes: 9.6, throughputEfficiencyPct: 91.5 },
  "J1-L3": { trainsMonitored: 11, activeConflicts: 1, avgDelaySavedMinutes: 6.1, throughputEfficiencyPct: 96.7 },
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export async function fetchOptimizationSchedule(corridorId: string): Promise<OptimizationSchedule> {
  try {
    // Try to hit the real .NET backend API
    const response = await fetch('/api/optimization/generate', { method: 'POST' });
    
    if (response.ok) {
      const apiResult = await response.json();
      
      // Map API result (OptimizationResult) to frontend UI shape
      // This maps the generated ScheduleBlocks into the UI's ShadowBlocks and conflicts
      const shadowBlocks: ShadowBlock[] = (apiResult.schedule || [])
        .filter((block: any) => block.status === "Shadow Block")
        .map((block: any, i: number) => ({
          id: block.blockId || `sb${i}`,
          sector: corridorId.includes("A1") ? "B12" : "F6", // map roughly for UI
          startSlot: Math.max(1, new Date(block.scheduledStart).getHours() % 20),
          span: Math.max(1, Math.ceil((block.durationMinutes || 60) / 15)),
          severity: block.criticalityScore > 0.8 ? "critical" : "warning",
          probability: block.criticalityScore || 0.8,
          label: `${block.department} Shadow`,
          resolved: false,
        }));
        
      const conflicts: Conflict[] = (apiResult.schedule || [])
        .filter((block: any) => block.status === "Conflict Detected" || block.status === "Deferred")
        .map((block: any, i: number) => ({
          id: `c${i}`,
          code: `Conflict #${i + 100}`,
          blockId: block.blockId,
          sector: corridorId.includes("A1") ? "C3" : "H8",
          trainA: "Unknown",
          trainB: "Unknown",
          detectedAt: new Date().toLocaleTimeString(),
          etaMinutes: 15,
          severity: "warning",
          description: block.conflictReason || "Constraint violation detected",
          resolved: false,
        }));

      return {
        engine: "Greedy-Shadow",
        version: "V2 Live",
        generatedAt: new Date().toISOString(),
        corridor: corridorId,
        kpis: {
          trainsMonitored: apiResult.totalTasks || 24,
          activeConflicts: apiResult.conflictsDetected || conflicts.length,
          avgDelaySavedMinutes: Math.round(apiResult.assetAvailabilityGain || 14.8),
          throughputEfficiencyPct: Math.min(99.9, 80 + (apiResult.assetAvailabilityGain || 14.2)),
        },
        trains: TRAINS[corridorId] ?? TRAINS["A1-D4"]!,
        shadowBlocks: shadowBlocks.length ? shadowBlocks : (SHADOW_BLOCKS[corridorId] ?? []),
        conflicts: conflicts.length ? conflicts : (CONFLICTS[corridorId] ?? []),
        recommendations: RECOMMENDATIONS[corridorId] ?? [],
      };
    }
    console.warn("API responded with error, falling back to mock data", await response.text());
  } catch (err) {
    console.warn("Failed to reach .NET backend, falling back to mock data", err);
  }

  // Fallback to mock data
  await new Promise((resolve) => setTimeout(resolve, 220));
  return clone({
    engine: "Greedy-Shadow",
    version: "V2.4.1 (Mock)",
    generatedAt: new Date().toISOString(),
    corridor: corridorId,
    kpis: KPIS[corridorId] ?? KPIS["A1-D4"]!,
    trains: TRAINS[corridorId] ?? [],
    shadowBlocks: SHADOW_BLOCKS[corridorId] ?? [],
    conflicts: CONFLICTS[corridorId] ?? [],
    recommendations: RECOMMENDATIONS[corridorId] ?? [],
  });
}

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
  { message: "Telemetry sync OK — 24 track circuits reporting", level: "info" },
  { message: "Shadow-block projection recomputed in 12ms", level: "info" },
  { message: "Headway margin nominal on sector A1", level: "success" },
  { message: "Signal SG-114 aspect change: double yellow", level: "warn" },
  { message: "Greedy-Shadow V2 heuristic pass complete (depth 4)", level: "info" },
  { message: "Platform occupancy model refreshed", level: "info" },
  { message: "Weather adhesion factor updated: 0.92", level: "warn" },
];
