// ─── API error ───────────────────────────────────────────────────────────────

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number | null = null,
    public readonly detail: string = "",
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// ─── Backend response shapes (as returned by .NET /api/optimization/generate) ─

export interface BackendScheduledBlock {
  blockId: string;
  taskId: string;
  department: string;
  trackSection: string;
  locationKm: string;
  scheduledStart: string;   // ISO 8601
  scheduledEnd: string;     // ISO 8601
  durationMinutes: number;
  priority: string;
  criticalityScore: number;
  windowId: string;
  status: "Scheduled" | "Shadow Block" | "Conflict Detected" | "Deferred";
  shadowBlockGroup: string | null;
  conflictReason: string | null;
}

export interface BackendOptimizationResult {
  totalTasks: number;
  scheduledTasks: number;
  shadowBlocks: number;
  conflictsDetected: number;
  assetAvailabilityGain: number;
  schedule: BackendScheduledBlock[];
}

export interface ReplayContext {
  corridorId: string;
  corridorLabel: string;
  planningStart: string;
  planningEnd: string;
  capturedAt: string;
  sourceSystem: string;
  sourceNote: string;
}

export interface ReplayTrainMovement {
  id: string;
  number: string;
  name: string;
  trainClass: string;
  sectionId: string;
  direction: string;
  scheduledEntry: string;
  scheduledExit: string;
}

export interface ReplayWindowCandidate {
  id: string;
  sectionId: string;
  start: string;
  end: string;
  usableMinutes: number;
  headwayBufferMinutes: number;
  occupiedByTrainIds: string[];
}

export type PlanningHorizon = "daily" | "weekly" | "monthly";

export interface DayBreakdown {
  date: string;
  label: string;
  totalRequests: number;
  scheduled: number;
  deferred: number;
  workMinutes: number;
  availabilityGainPct: number;
}

// ─── Triage types ────────────────────────────────────────────────────────────

/** The 5 risk buckets produced by the Python _triage_tier function. */
export type TriageTier = "blocked" | "critical" | "high" | "watch" | "clear";

/** Auditable score breakdown for a single triage item. */
export interface TriageComponents {
  /** ML prioritizer risk score (0–1). */
  mlRisk: number;
  /** Normalised train-exposure factor (trains bracketing the gap / 12). */
  exposure: number;
  /** Days since the case was reported (unnormalised). */
  ageDays: number;
  /** Safety-requirement weight: count of procedure booleans / 4. */
  safetyWeight: number;
}

/** One triage item — corresponds to one scheduled/deferred block. */
export interface TriageItem {
  blockId: string;
  taskId: string;
  department: string;
  sectionId: string;
  locationKm: string;
  status: string;
  triageTier: TriageTier;
  triageScore: number;
  components: TriageComponents;
  reportedAt: string | null;
  workMinutes: number;
  requirements: string[];
  recommendation: string;
  impact: {
    trainsImpacted: number;
    estimatedDelayMinutes: number;
  };
}

/** Rollup counts across all triage items for the planning horizon. */
export interface TriageRollup {
  blocked: number;
  critical: number;
  high: number;
  watch: number;
  clear: number;
  /** Count of items with status === "Deferred". */
  backlog: number;
  /** Highest individual triage score in the set (0–1). */
  highestRisk: number;
}

export interface TriageQueue {
  rollup: TriageRollup;
  items: TriageItem[];
}

export interface BackendReplayOptimizationResult {
  mode: "replay";
  horizon: PlanningHorizon;
  planningDays: number;
  replayContext: ReplayContext;
  trainMovements: ReplayTrainMovement[];
  windowCandidates: ReplayWindowCandidate[];
  totalTasks: number;
  scheduledTasks: number;
  conflictsDetected: number;
  assetAvailabilityGain: number;
  schedule: BackendScheduledBlock[];
  recommendations: ScheduleRecommendation[];
  dayBreakdown: DayBreakdown[];
  mlStats?: MlStats;
  triage?: TriageQueue;
}

// ─── Domain types ─────────────────────────────────────────────────────────────

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
  conflictId: string;
  sector: string;
  startSlot: number;
  span: number;
  severity: "critical" | "warning";
  status: "scheduled" | "blocked" | "deferred";
  probability: number;
  label: string;
  department?: string;
  conflictReason?: string;
  blockingTrainNumbers?: string[];
  resolved: boolean;
  /** Planning-day index this block belongs to (0-based). */
  dayIndex: number;
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
  /** Planning-day index this decision belongs to (0-based). */
  dayIndex: number;
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
  replayContext?: ReplayContext;
  horizon?: PlanningHorizon;
  planningDays?: number;
  dayBreakdown?: DayBreakdown[];
  /** Backend raw scheduled blocks, kept for per-day filtering. */
  blocks?: BackendScheduledBlock[];
  /** Live ML prioritization stats + per-decision feed (replay only). */
  mlStats?: MlStats | null;
  /** Explainable triage queue — ranked items + rollup counts (replay only). */
  triage?: TriageQueue | null;
}

export type MlTier = "critical" | "high" | "watch" | "low";

export interface MlDecision {
  blockId: string;
  caseId: string;
  department: string;
  sectionId: string;
  label: string;
  mlScore: number;
  tier: MlTier;
  status: string;
  day: number;
}

export interface MlStats {
  mode: "ml" | "heuristic" | "unavailable";
  active: boolean;
  engine: string;
  cases: number;
  scoredByModel: number;
  scoredByHeuristic: number;
  scoreMin: number;
  scoreMax: number;
  scoreMean: number;
  tiers: Partial<Record<MlTier, number>>;
  decisionsMade: number;
  scheduledHighRisk: number;
  deferredCount: number;
  decisionFeed: MlDecision[];
}
