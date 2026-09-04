export type TrainClass = "freight" | "express" | "suburban";
export type TrainStatus = "on-time" | "delayed" | "held" | "rerouted";

export interface Train {
  id: string;
  number: string;
  name: string;
  trainClass: TrainClass;
  priority: number;
  status: TrainStatus;
  delayMinutes: number;
  /** Block index where the train's occupation starts (column in the grid). */
  startSlot: number;
  /** Number of time slots the train occupies. */
  span: number;
  /** Corridor sector row, e.g. "A1". */
  sector: string;
  speedKph: number;
}

export interface ShadowBlock {
  id: string;
  sector: string;
  startSlot: number;
  span: number;
  severity: "critical" | "warning";
  probability: number;
  label: string;
  resolved: boolean;
}

export interface Conflict {
  id: string;
  code: string;
  blockId: string;
  sector: string;
  trainA: string;
  trainB: string;
  detectedAt: string;
  etaMinutes: number;
  severity: "critical" | "warning";
  description: string;
  resolved: boolean;
}

export interface ScheduleRecommendation {
  id: string;
  conflictId: string;
  strategy: string;
  confidence: number;
  delaySavedMinutes: number;
  throughputDeltaPct: number;
  computeMs: number;
  steps: { trainNumber: string; action: string; detail: string }[];
}

export interface KpiSnapshot {
  trainsMonitored: number;
  activeConflicts: number;
  avgDelaySavedMinutes: number;
  throughputEfficiencyPct: number;
}

export interface LogEntry {
  id: string;
  time: string;
  level: "info" | "warn" | "error" | "success";
  message: string;
}

export interface Corridor {
  id: string;
  label: string;
  sectors: string[];
}

export interface OptimizationSchedule {
  engine: string;
  version: string;
  generatedAt: string;
  corridor: string;
  kpis: KpiSnapshot;
  trains: Train[];
  shadowBlocks: ShadowBlock[];
  conflicts: Conflict[];
  recommendations: ScheduleRecommendation[];
}
