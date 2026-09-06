"""
RailBlock AI - Optimization Engine
The "Brain" that schedules maintenance tasks into corridor windows.

Data flow (primary):
  .NET API (port 5053) seeds data from JSON files at startup.
  This engine calls GET http://localhost:5053/api/optimization/data
  to retrieve {tasks, corridor_windows}, then runs the scheduling algorithm.

Data flow (fallback):
  If .NET is unreachable, /data-optimize falls back to reading the JSON files
  directly from the data/ directory.
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime, timedelta
import sys
import httpx
import json
import os
import logging
import re
from enum import Enum
from collections import defaultdict

logger = logging.getLogger("railblock")

class _UnavailablePriorityModel:
    trained = False
    metrics = {}


PriorityModel = _UnavailablePriorityModel
build_features = None

# Optional ML prioritization module (kept import-safe so the engine still runs
# if scikit-learn or the trained model is unavailable).
try:
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "ml"))
    from prioritizer import PriorityModel, build_features  # type: ignore
    _ML_PRIORITIZER = PriorityModel()
    _PRIORITIZER_MODEL_PATH = os.path.join(os.path.dirname(__file__), "..", "ml", "prioritizer_model.pkl")
    if os.path.exists(_PRIORITIZER_MODEL_PATH):
        import pickle as _pickle
        with open(_PRIORITIZER_MODEL_PATH, "rb") as _f:
            _ML_PRIORITIZER = _pickle.load(_f)
        _ML_STATUS = "ml"
    else:
        _ML_STATUS = "untrained"
except Exception as _e:  # noqa: BLE001
    _ML_PRIORITIZER = None
    _ML_STATUS = f"unavailable ({_e})"
    _ML_ERROR = str(_e)

# URL of the .NET API data endpoint
DOTNET_API_BASE = os.environ.get("DOTNET_API_BASE", "http://localhost:5053")
DOTNET_DATA_URL  = f"{DOTNET_API_BASE}/api/optimization/data"

app = FastAPI(title="RailBlock AI - Optimization Engine")

# CORS — allow frontend dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:4173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============= DATA MODELS =============

class Priority(str, Enum):
    CRITICAL = "Critical"
    HIGH = "High"
    MEDIUM = "Medium"
    LOW = "Low"

class ScheduleStatus(str, Enum):
    SCHEDULED = "Scheduled"
    SHADOW_BLOCK = "Shadow Block"
    CONFLICT = "Conflict Detected"
    DEFERRED = "Deferred"

class CorridorWindow(BaseModel):
    window_id: str
    track_section: str
    available_start: datetime
    available_end: datetime
    duration_minutes: int
    window_type: str
    constraints: List[str] = []

class MaintenanceTask(BaseModel):
    task_id: str
    department: str
    task_type: str
    description: str
    track_section: str
    location_km: str
    duration_minutes: int
    required_resources: List[str] = []
    priority: str
    criticality_score: float = Field(ge=0.0, le=1.0)
    dependencies: List[str] = []
    requested_by: str
    requested_date: datetime

class ScheduledBlock(BaseModel):
    block_id: str
    task_id: str
    department: str
    track_section: str
    location_km: str
    scheduled_start: datetime
    scheduled_end: datetime
    duration_minutes: int
    priority: str
    criticality_score: float
    window_id: str
    status: ScheduleStatus
    shadow_block_group: Optional[str] = None
    conflict_reason: Optional[str] = None

class OptimizationResult(BaseModel):
    total_tasks: int
    scheduled_tasks: int
    shadow_blocks: int
    conflicts_detected: int
    asset_availability_gain: float
    schedule: List[ScheduledBlock]
    # Replay path only: {scores: {case_id: float}} filled by optimize_replay.
    ml_info: Optional[dict] = None

class OptimizationRequest(BaseModel):
    tasks: List[MaintenanceTask]
    corridor_windows: List[CorridorWindow]

class ReplayContext(BaseModel):
    data_mode: str
    corridor_id: str
    corridor_label: str
    planning_start: datetime
    planning_end: datetime
    captured_at: datetime
    source_system: str
    source_note: str
    horizon: str = "daily"      # daily | weekly | monthly
    planning_days: int = 1

class TrainMovement(BaseModel):
    id: str
    train_number: str
    train_name: str
    train_class: str
    section_id: str
    direction: str
    scheduled_entry: datetime
    scheduled_exit: datetime
    source_system: str
    source_record_id: str
    confidence: str

class ProcedureProfile(BaseModel):
    id: str
    traffic_block_required: bool
    power_block_required: bool
    disconnection_notice_required: bool
    permit_to_work_required: bool
    minimum_setup_minutes: int
    minimum_clearance_minutes: int

class MaintenanceCase(BaseModel):
    case_id: str
    scenario_type: str
    department: str
    asset_type: str
    description: str
    section_id: str
    location_reference: str
    reported_at: datetime
    urgency: str
    estimated_work_minutes: int
    required_resources: List[str]
    procedure_profile_id: str

class ReplayOptimizationRequest(BaseModel):
    replay_context: ReplayContext
    train_movements: List[TrainMovement]
    procedure_profiles: List[ProcedureProfile]
    maintenance_cases: List[MaintenanceCase]

# ============= PRIORITIZATION ENGINE =============

class PrioritizationEngine:
    PRIORITY_WEIGHTS = {
        Priority.CRITICAL.value: 0.95,
        Priority.HIGH.value: 0.75,
        Priority.MEDIUM.value: 0.50,
        Priority.LOW.value: 0.25
    }
    
    DEPARTMENT_CRITICALITY = {
        "Engineering": 0.8,
        "Signal & Telecommunication": 0.9,
        "Traction Distribution": 0.85
    }
    
    # The ML module may be unavailable; track whether we are scoring via the
    # calibrated gradient-boosted model or the classic heuristic.
    ML_ENABLED = isinstance(_ML_PRIORITIZER, PriorityModel) and _ML_PRIORITIZER.trained

    @classmethod
    def calculate_priority_score(cls, task: MaintenanceTask, defect: Optional[dict] = None) -> float:
        """Return the priority score in [0,1].

        Prefers the calibrated ML model; falls back to the classic heuristic so
        the engine is robust. The ML path is ~13-feature based and includes the
        linked defect's age + severity and corridor train density.
        """
        if cls.ML_ENABLED:
            try:
                feat = build_features(
                    {
                        "priority": task.priority,
                        "department": task.department,
                        "task_type": task.task_type,
                        "criticality_score": task.criticality_score,
                        "track_section": task.track_section,
                        "required_resources": task.required_resources,
                        "dependencies": task.dependencies,
                        "duration_minutes": task.duration_minutes,
                    },
                    defect,
                )
                score, used_model = _ML_PRIORITIZER.predict(feat)
                return round(float(score), 3)
            except Exception:
                pass  # fall through to heuristic on any ML error
        return cls._heuristic_score(task)

    @classmethod
    def _heuristic_score(cls, task: MaintenanceTask) -> float:
        priority_weight = cls.PRIORITY_WEIGHTS.get(task.priority, 0.5)
        dept_factor = cls.DEPARTMENT_CRITICALITY.get(task.department, 0.7)
        score = (
            priority_weight * 0.5 +
            task.criticality_score * 0.3 +
            dept_factor * 0.2
        )
        return round(score, 3)
    
    @classmethod
    def rank_tasks(cls, tasks: List[MaintenanceTask], defects_by_task: Optional[dict] = None) -> List[MaintenanceTask]:
        def key(t):
            defect = (defects_by_task or {}).get(t.task_id)
            return cls.calculate_priority_score(t, defect)
        return sorted(tasks, key=key, reverse=True)

# ============= SCHEDULING ENGINE =============

class SchedulingEngine:
    def __init__(self, tasks: List[MaintenanceTask], windows: List[CorridorWindow], defects_by_task: Optional[dict] = None):
        self.tasks = PrioritizationEngine.rank_tasks(tasks, defects_by_task)
        self.windows = sorted(windows, key=lambda w: w.available_start)
        self.defects_by_task = defects_by_task or {}
        self.schedule: List[ScheduledBlock] = []
        self.window_usage = defaultdict(list) 
        
    def optimize(self) -> OptimizationResult:
        scheduled_count = 0
        shadow_count = 0
        conflict_count = 0
        
        for task in self.tasks:
            scheduled = self._schedule_task(task)
            if scheduled:
                scheduled_count += 1
                if scheduled.status == ScheduleStatus.SHADOW_BLOCK:
                    shadow_count += 1
            else:
                conflict_count += 1
        
        availability_gain = self._calculate_availability_gain()
        
        return OptimizationResult(
            total_tasks=len(self.tasks),
            scheduled_tasks=scheduled_count,
            shadow_blocks=shadow_count,
            conflicts_detected=conflict_count,
            asset_availability_gain=round(availability_gain, 1),
            schedule=self.schedule
        )
    
    def _schedule_task(self, task: MaintenanceTask) -> Optional[ScheduledBlock]:
        for window in self.windows:
            if window.track_section != task.track_section:
                continue
            
            if not self._check_constraints(task, window):
                continue
            
            slot = self._find_slot(task, window)
            if slot:
                start_time, end_time = slot
                shadow_group = self._check_shadow_opportunity(task, window, start_time, end_time)
                
                status = ScheduleStatus.SHADOW_BLOCK if shadow_group else ScheduleStatus.SCHEDULED
                
                block = ScheduledBlock(
                    block_id=f"BLK-{task.task_id}",
                    task_id=task.task_id,
                    department=task.department,
                    track_section=task.track_section,
                    location_km=task.location_km,
                    scheduled_start=start_time,
                    scheduled_end=end_time,
                    duration_minutes=task.duration_minutes,
                    priority=task.priority,
                    criticality_score=task.criticality_score,
                    window_id=window.window_id,
                    status=status,
                    shadow_block_group=shadow_group
                )
                
                self.schedule.append(block)
                self.window_usage[window.window_id].append((start_time, end_time, task.department))
                return block
        
        self.schedule.append(ScheduledBlock(
            block_id=f"BLK-{task.task_id}-DEFERRED",
            task_id=task.task_id,
            department=task.department,
            track_section=task.track_section,
            location_km=task.location_km,
            scheduled_start=datetime.min,
            scheduled_end=datetime.min,
            duration_minutes=task.duration_minutes,
            priority=task.priority,
            criticality_score=task.criticality_score,
            window_id="NONE",
            status=ScheduleStatus.DEFERRED,
            conflict_reason="No suitable corridor window available"
        ))
        return None
    
    def _find_slot(self, task: MaintenanceTask, window: CorridorWindow) -> Optional[tuple]:
        window_duration = (window.available_end - window.available_start).total_seconds() / 60
        if task.duration_minutes > window_duration:
            return None
        
        used_slots = self.window_usage.get(window.window_id, [])
        current_time = window.available_start
        
        for used_start, used_end, _ in sorted(used_slots, key=lambda x: x[0]):
            gap_minutes = (used_start - current_time).total_seconds() / 60
            if gap_minutes >= task.duration_minutes:
                return (current_time, current_time + timedelta(minutes=task.duration_minutes))
            current_time = max(current_time, used_end)
        
        remaining_minutes = (window.available_end - current_time).total_seconds() / 60
        if remaining_minutes >= task.duration_minutes:
            return (current_time, current_time + timedelta(minutes=task.duration_minutes))
        return None
    
    def _check_constraints(self, task: MaintenanceTask, window: CorridorWindow) -> bool:
        for constraint in window.constraints:
            if "No OHE" in constraint and task.department == "Traction Distribution":
                if task.task_type in ["Corrective Maintenance", "Emergency Repair"]:
                    return False
        return True
    
    def _check_shadow_opportunity(self, task: MaintenanceTask, window: CorridorWindow, 
                                   start: datetime, end: datetime) -> Optional[str]:
        for used_start, used_end, dept in self.window_usage.get(window.window_id, []):
            if start < used_end and end > used_start:
                if dept != task.department:
                    return f"SHADOW-{window.window_id}-{dept[:3]}-{task.department[:3]}"
        return None
    
    def _calculate_availability_gain(self) -> float:
        scheduled_blocks = [b for b in self.schedule if b.status in [ScheduleStatus.SCHEDULED, ScheduleStatus.SHADOW_BLOCK]]
        if not scheduled_blocks: return 0.0
        total_scheduled_time = sum(b.duration_minutes for b in scheduled_blocks)
        shadow_blocks = [b for b in scheduled_blocks if b.status == ScheduleStatus.SHADOW_BLOCK]
        shadow_time_saved = sum(b.duration_minutes for b in shadow_blocks) * 0.5
        return min(((total_scheduled_time + shadow_time_saved) / 20160.0) * 100, 25.0)

# ============= HELPERS =============

async def _fetch_data_from_dotnet() -> OptimizationRequest:
    """
    Pull tasks + corridor windows from the .NET API.
    Raises HTTPException(503) if the .NET API is unreachable.
    """
    logger.info("Fetching optimization data from .NET API: %s", DOTNET_DATA_URL)
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(DOTNET_DATA_URL)
            response.raise_for_status()
    except httpx.ConnectError:
        raise HTTPException(
            status_code=503,
            detail=(
                f"Cannot connect to the .NET API at {DOTNET_API_BASE}. "
                "Start it with: cd backend/RailBlockAI.Api && dotnet run"
            )
        )
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Request to .NET API timed out after 15 seconds.")
    except httpx.HTTPStatusError as e:
        raise HTTPException(
            status_code=e.response.status_code,
            detail=f".NET API returned an error: {e.response.text}"
        )

    payload = response.json()
    tasks   = [MaintenanceTask(**t)   for t in payload["tasks"]]
    windows = [CorridorWindow(**w)    for w in payload["corridor_windows"]]
    logger.info("Received %d tasks and %d corridor windows from .NET", len(tasks), len(windows))
    return OptimizationRequest(tasks=tasks, corridor_windows=windows)


def _load_data_from_files() -> OptimizationRequest:
    """
    Fallback: read maintenance_tasks.json and corridor_windows.json directly from data/.
    Used when the .NET API is not running.
    """
    data_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "data"))
    tasks_path   = os.path.join(data_dir, "maintenance_tasks.json")
    windows_path = os.path.join(data_dir, "corridor_windows.json")

    for path in (tasks_path, windows_path):
        if not os.path.exists(path):
            raise HTTPException(
                status_code=404,
                detail=f"Data file not found: {path}. Run data-generator/generate_data.py first."
            )

    with open(tasks_path)   as f: raw_tasks   = json.load(f)
    with open(windows_path) as f: raw_windows = json.load(f)

    tasks   = [MaintenanceTask(**t) for t in raw_tasks]
    windows = [CorridorWindow(**w)  for w in raw_windows]
    logger.info("Loaded %d tasks and %d corridor windows from JSON files", len(tasks), len(windows))
    return OptimizationRequest(tasks=tasks, corridor_windows=windows)


def _load_defects_by_task() -> dict:
    """Load defects.json and index by the linked task_id for ML ranking."""
    data_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "data"))
    defects_path = os.path.join(data_dir, "defects.json")
    if not os.path.exists(defects_path):
        return {}
    with open(defects_path, encoding="utf-8") as f:
        raw = json.load(f)
    return {d.get("task_id"): d for d in raw if d.get("task_id")}


def _replay_priority(case: MaintenanceCase) -> int:
    return {"emergency": 0, "urgent": 1, "planned": 2}.get(case.urgency, 3)


_REPLAY_URGENCY_PRIORITY = {"emergency": "Critical", "urgent": "High", "planned": "Medium"}


def _replay_case_features(case: MaintenanceCase) -> dict:
    """Map a replay case to the ML feature dict (replay bundles carry no defects)."""
    return {
        "priority": _REPLAY_URGENCY_PRIORITY.get(case.urgency, "Low"),
        "department": case.department,
        "task_type": "Corrective Maintenance"
        if case.urgency in ("emergency", "urgent")
        else "Preventive Maintenance",
        "criticality_score": {"emergency": 0.95, "urgent": 0.8, "planned": 0.5}.get(case.urgency, 0.3),
        "track_section": case.section_id,
        "required_resources": case.required_resources,
        "dependencies": [],
        "duration_minutes": case.estimated_work_minutes,
    }


def _replay_heuristic_score(case: MaintenanceCase) -> float:
    """Deterministic fallback when the ML model is inactive (mirrors urgency)."""
    urgency_w = {"emergency": 0.95, "urgent": 0.75, "planned": 0.5}.get(case.urgency, 0.3)
    duration_w = min(case.estimated_work_minutes / 180.0, 1.0)
    return round(min(urgency_w * 0.8 + 0.2 * duration_w, 1.0), 3)


def _ml_tier(score: float) -> str:
    """Bucket a calibrated ML score into a triage tier.

    The replay cases carry no linked defect, so age/severity features sit at
    their floor and the model's calibrated scores compress towards ~0.2-0.7.
    Thresholds are tuned to that honest range rather than a nominal 0-1 spread.
    """
    if score >= 0.6:
        return "critical"
    if score >= 0.4:
        return "high"
    return "watch"


def _score_replay_cases(cases: List[MaintenanceCase]) -> Tuple[dict, dict]:
    """Score every replay case with the trained ML prioritizer.

    Returns (case_id -> ml_score, ml_stats). Falls back to the heuristic score
    when the model is not active and always annotates which path was used, so
    the UI can be honest about whether decisions were ML-driven.
    """
    scores: Dict[str, float] = {}
    ml_ok = isinstance(_ML_PRIORITIZER, PriorityModel) and _ML_PRIORITIZER.trained
    mode = "ml" if ml_ok else ("unavailable" if _ML_PRIORITIZER is None else "heuristic")
    engine = "GradientBoosting + Isotonic (scikit-learn)" if ml_ok else "Legacy heuristic fallback"
    scored_by_model = 0

    for case in cases:
        if ml_ok:
            try:
                feat = build_features(_replay_case_features(case), None, None)
                score, used = _ML_PRIORITIZER.predict(feat)
                scores[case.case_id] = round(float(score), 3)
                if used:
                    scored_by_model += 1
            except Exception:  # noqa: BLE001 — a model failure must not block scheduling
                scores[case.case_id] = _replay_heuristic_score(case)
        else:
            scores[case.case_id] = _replay_heuristic_score(case)

    values = list(scores.values()) if scores else [0.0]
    tier_counts: Dict[str, int] = {}
    for v in values:
        tier_counts[_ml_tier(v)] = tier_counts.get(_ml_tier(v), 0) + 1

    return scores, {
        "mode": mode,
        "active": ml_ok,
        "engine": engine,
        "cases": len(scores),
        "scoredByModel": scored_by_model,
        "scoredByHeuristic": len(scores) - scored_by_model,
        "scoreMin": round(min(values), 3),
        "scoreMax": round(max(values), 3),
        "scoreMean": round(sum(values) / len(values), 3),
        "tiers": tier_counts,
    }


def _derive_replay_gaps(request: ReplayOptimizationRequest) -> List[dict]:
    """Return timetable gaps after applying a deterministic 15-minute headway."""
    start, end = request.replay_context.planning_start, request.replay_context.planning_end
    occupied = []
    for movement in request.train_movements:
        entry = max(start, movement.scheduled_entry - timedelta(minutes=15))
        exit = min(end, movement.scheduled_exit + timedelta(minutes=15))
        if entry < exit:
            occupied.append((entry, exit, movement.id))
    occupied.sort(key=lambda item: item[0])
    merged = []
    for entry, exit, movement_id in occupied:
        if merged and entry <= merged[-1][1]:
            merged[-1] = (merged[-1][0], max(merged[-1][1], exit), merged[-1][2] + [movement_id])
        else:
            merged.append((entry, exit, [movement_id]))
    gaps, cursor, previous_movement_ids = [], start, []
    for entry, exit, movement_ids in merged:
        if cursor < entry:
            gaps.append({
                "start": cursor,
                "end": entry,
                "occupied_by_train_ids": previous_movement_ids + movement_ids,
            })
        cursor = max(cursor, exit)
        previous_movement_ids = movement_ids
    if cursor < end:
        gaps.append({
            "start": cursor,
            "end": end,
            "occupied_by_train_ids": previous_movement_ids,
        })
    return gaps


def _horizon_planning_days(request: ReplayOptimizationRequest) -> int:
    """Derive the number of planning days from the requested horizon."""
    ctx = request.replay_context
    if getattr(ctx, "planning_days", 0) and int(ctx.planning_days) > 1:
        return int(ctx.planning_days)
    return {"daily": 1, "weekly": 7, "monthly": 30}.get(ctx.horizon, 1)


def optimize_replay(request: ReplayOptimizationRequest) -> OptimizationResult:
    """
    Schedule procedure-driven cases into gaps derived from a frozen timetable,
    across the requested planning horizon (daily / weekly / monthly).

    Each maintenance case is a repeatable work item with a recurrence interval.
    Within the horizon, every day's timetable gap is a candidate slot; a case is
    scheduled on a day when a safe gap exists and none is already reserved.

    Cases are ranked by the trained ML prioritizer (calibrated [0,1] score),
    falling back to a heuristic so the engine never breaks without sklearn.
    """
    profiles = {profile.id: profile for profile in request.procedure_profiles}
    days = _horizon_planning_days(request)
    ml_scores, _ml_stats = _score_replay_cases(request.maintenance_cases)

    # Recurrence: a case is demanded once per day of the horizon (a daily demand
    # pattern). This models recurring/weekly/monthly maintenance load honestly.
    horizon_days = list(range(days))
    total_requests = len(request.maintenance_cases) * days

    schedule: List[ScheduledBlock] = []
    scheduled_count = 0

    for d in horizon_days:
        day_offset = timedelta(days=d)
        used: List[tuple] = []

        # Build a day-shifted copy of the request so timetable + gaps reflect day `d`.
        shifted = request.model_copy(deep=True)
        shifted.replay_context.planning_start = shifted.replay_context.planning_start + day_offset
        shifted.replay_context.planning_end = shifted.replay_context.planning_end + day_offset
        for m in shifted.train_movements:
            m.scheduled_entry = m.scheduled_entry + day_offset
            m.scheduled_exit = m.scheduled_exit + day_offset
        for c in shifted.maintenance_cases:
            c.reported_at = c.reported_at + day_offset

        gaps = _derive_replay_gaps(shifted)
        day_blocks: List[ScheduledBlock] = []

        for case in sorted(
            shifted.maintenance_cases,
            key=lambda c: (-ml_scores.get(c.case_id, 0.0), _replay_priority(c)),
        ):
            profile = profiles.get(case.procedure_profile_id)
            if profile is None:
                raise HTTPException(status_code=422, detail=f"Unknown procedure profile: {case.procedure_profile_id}")
            required = case.estimated_work_minutes + profile.minimum_setup_minutes + profile.minimum_clearance_minutes
            chosen = None
            for gap in gaps:
                candidate_start = max(gap["start"], case.reported_at)
                candidate_end = candidate_start + timedelta(minutes=required)
                overlaps_reserved = any(candidate_start < end and candidate_end > start for start, end in used)
                if candidate_end <= gap["end"] and not overlaps_reserved:
                    chosen = (candidate_start, candidate_end)
                    break

            priority = {"emergency": "Critical", "urgent": "High", "planned": "Medium"}.get(case.urgency, "Low")
            day_tag = f"d{d}"
            if chosen:
                access = []
                if profile.traffic_block_required: access.append("temporary track closure")
                if profile.power_block_required: access.append("electrical isolation")
                if profile.disconnection_notice_required: access.append("equipment disconnection notice")
                if profile.permit_to_work_required: access.append("formal safety clearance")
                work_start = chosen[0] + timedelta(minutes=profile.minimum_setup_minutes)
                work_end = work_start + timedelta(minutes=case.estimated_work_minutes)
                block = ScheduledBlock(
                    block_id=f"RPL-{case.case_id}-{day_tag}", task_id=case.case_id, department=case.department,
                    track_section=case.section_id, location_km=case.location_reference,
                    scheduled_start=work_start, scheduled_end=work_end,
                    duration_minutes=case.estimated_work_minutes, priority=priority,
                    criticality_score={"emergency": .95, "urgent": .8, "planned": .5}.get(case.urgency, .3),
                    window_id=f"GAP-{chosen[0].strftime('%H%M')}", status=ScheduleStatus.SCHEDULED,
                    conflict_reason=f"Safety requirements: {', '.join(access)}."
                )
                schedule.append(block)
                day_blocks.append(block)
                used.append(chosen)
                scheduled_count += 1
            else:
                block = ScheduledBlock(
                    block_id=f"RPL-{case.case_id}-{day_tag}-DEFERRED", task_id=case.case_id, department=case.department,
                    track_section=case.section_id, location_km=case.location_reference,
                    scheduled_start=datetime.min, scheduled_end=datetime.min,
                    duration_minutes=case.estimated_work_minutes, priority=priority,
                    criticality_score={"emergency": .95, "urgent": .8, "planned": .5}.get(case.urgency, .3),
                    window_id="NONE", status=ScheduleStatus.DEFERRED,
                    conflict_reason="No safe gap in the saved timetable is long enough for this work."
                )
                schedule.append(block)
                day_blocks.append(block)

    # Asset availability gain across the horizon: share of each day's usable
    # planning window consumed by scheduled maintenance (scale-invariant).
    availability_gain = 0.0
    if schedule:
        horizon_minutes = max(1, (request.replay_context.planning_end - request.replay_context.planning_start).total_seconds() / 60)
        total_work = sum(b.duration_minutes for b in schedule if b.status == ScheduleStatus.SCHEDULED)
        availability_gain = round(min((total_work / (days * horizon_minutes)) * 100, 100.0), 1)

    return OptimizationResult(
        total_tasks=total_requests, scheduled_tasks=scheduled_count,
        shadow_blocks=0, conflicts_detected=total_requests - scheduled_count,
        asset_availability_gain=availability_gain, schedule=schedule,
        ml_info={"scores": ml_scores, "stats": _ml_stats},
    )


def _camel_case_block(block: ScheduledBlock) -> dict:
    return {
        "blockId": block.block_id, "taskId": block.task_id, "department": block.department,
        "trackSection": block.track_section, "locationKm": block.location_km,
        "scheduledStart": block.scheduled_start.isoformat(), "scheduledEnd": block.scheduled_end.isoformat(),
        "durationMinutes": block.duration_minutes, "priority": block.priority,
        "criticalityScore": block.criticality_score, "windowId": block.window_id,
        "status": block.status.value, "shadowBlockGroup": block.shadow_block_group,
        "conflictReason": block.conflict_reason,
    }


def _triage_tier(score: float, status: ScheduleStatus) -> str:
    """Map a triage score + block status to the 5-bucket triage tier.

    The blended score rarely exceeds ~0.65 for replay cases (no linked defect,
    so mlRisk sits in the 0.2-0.65 band), so thresholds are tuned to that
    practical range rather than a nominal 0-1 spread.
    """
    if status == ScheduleStatus.DEFERRED and score >= 0.5:
        return "blocked"       # high risk but no feasible gap → escalate
    if score >= 0.5:
        return "critical"
    if score >= 0.3:
        return "high"
    if score >= 0.15:
        return "watch"
    return "clear"


def _compute_triage(request: ReplayOptimizationRequest, result: OptimizationResult,
                    ml_scores: dict) -> dict:
    """
    Score every scheduled block into an explainable triage queue.

    triage = 0.45 * ml_risk         (trained ML prioritizer, calibrated [0,1])
           + 0.25 * exposure        (trains bracketing the work gap, /12)
           + 0.15 * age_since_report(days since case reported, /7)
           + 0.15 * safety_weight   (procedure-profile safety requirements, /4)

    Every component stays in the payload so the score is auditable — this is a
    demonstrated methodology on synthetic data, not real telemetry.
    """
    profiles = {profile.id: profile for profile in request.procedure_profiles}
    cases = {case.case_id: case for case in request.maintenance_cases}
    days = _horizon_planning_days(request)

    # Per-day gaps (day-shifted copies of the frozen timetable) so a scheduled
    # block's exposure is the trains that bracket the gap it sits in.
    day_gaps: dict[int, list] = {}
    for d in range(days):
        shifted = request.model_copy(deep=True)
        shifted.replay_context.planning_start = shifted.replay_context.planning_start + timedelta(days=d)
        shifted.replay_context.planning_end = shifted.replay_context.planning_end + timedelta(days=d)
        for m in shifted.train_movements:
            m.scheduled_entry = m.scheduled_entry + timedelta(days=d)
            m.scheduled_exit = m.scheduled_exit + timedelta(days=d)
        day_gaps[d] = _derive_replay_gaps(shifted)

    planning_start = request.replay_context.planning_start
    items: List[dict] = []

    for block in result.schedule:
        day_match = re.search(r"-d(\d+)(?:-DEFERRED)?$", block.block_id)
        day = int(day_match.group(1)) if day_match else 0
        case = cases.get(block.task_id)
        profile = profiles.get(case.procedure_profile_id) if case else None

        ml_risk = float(ml_scores.get(block.task_id, 0.0))

        trains_impacted = 0
        if block.status != ScheduleStatus.DEFERRED and block.scheduled_start != datetime.min:
            for gap in day_gaps.get(day, []):
                if gap["start"] <= block.scheduled_start < gap["end"]:
                    trains_impacted = len(gap["occupied_by_train_ids"])
                    break
        exposure = round(min(trains_impacted / 12.0, 1.0), 3)

        age_days = 0.0
        if case and case.reported_at:
            age_days = (case.reported_at - planning_start).total_seconds() / 86400.0
        age_norm = round(min(max(age_days, 0.0) / 7.0, 1.0), 3)

        safety_weight = 0.0
        requirements: List[str] = []
        if profile:
            safety_weight = round(sum([
                profile.traffic_block_required,
                profile.power_block_required,
                profile.disconnection_notice_required,
                profile.permit_to_work_required,
            ]) / 4.0, 3)
            if profile.traffic_block_required: requirements.append("temporary track closure")
            if profile.power_block_required: requirements.append("electrical isolation")
            if profile.disconnection_notice_required: requirements.append("equipment disconnection notice")
            if profile.permit_to_work_required: requirements.append("formal safety clearance")

        triage_score = round(
            0.45 * ml_risk + 0.25 * exposure + 0.15 * age_norm + 0.15 * safety_weight,
            3,
        )
        status = block.status

        if status == ScheduleStatus.DEFERRED:
            recommendation = "Escalate — high risk, no safe gap" if triage_score >= 0.5 else "Wait for a safe gap"
        elif status == ScheduleStatus.SHADOW_BLOCK:
            recommendation = "Approach with parallel work"
        else:
            recommendation = "Approach now" if triage_score >= 0.5 else "On schedule — clear"

        items.append({
            "blockId": block.block_id,
            "taskId": block.task_id,
            "department": block.department,
            "sectionId": block.track_section,
            "locationKm": block.location_km,
            "status": status.value,
            "triageTier": _triage_tier(triage_score, status),
            "triageScore": triage_score,
            "components": {
                "mlRisk": round(ml_risk, 3),
                "exposure": exposure,
                "ageDays": round(max(age_days, 0.0), 2),
                "safetyWeight": safety_weight,
            },
            "reportedAt": case.reported_at.isoformat() if case else None,
            "workMinutes": block.duration_minutes,
            "requirements": requirements,
            "recommendation": recommendation,
            "impact": {
                "trainsImpacted": trains_impacted,
                "estimatedDelayMinutes": trains_impacted * 8,
            },
        })

    items.sort(key=lambda x: -x["triageScore"])
    rollup = {"critical": 0, "high": 0, "watch": 0, "clear": 0, "blocked": 0}
    for item in items:
        rollup[item["triageTier"]] = rollup.get(item["triageTier"], 0) + 1
    rollup["backlog"] = sum(1 for i in items if i["status"] == ScheduleStatus.DEFERRED.value)
    rollup["highestRisk"] = round(max((i["triageScore"] for i in items), default=0.0), 3)

    return {"rollup": rollup, "items": items}


def _replay_response(request: ReplayOptimizationRequest, result: OptimizationResult) -> dict:
    profiles = {profile.id: profile for profile in request.procedure_profiles}
    cases = {case.case_id: case for case in request.maintenance_cases}
    recommendations = []
    for block in result.schedule:
        case = cases[block.task_id]
        profile = profiles[case.procedure_profile_id]
        is_scheduled = block.status != ScheduleStatus.DEFERRED
        requirements = []
        if profile.traffic_block_required: requirements.append("temporary track closure")
        if profile.power_block_required: requirements.append("electrical isolation")
        if profile.disconnection_notice_required: requirements.append("equipment disconnection notice")
        if profile.permit_to_work_required: requirements.append("formal safety clearance")
        recommendations.append({
            "id": f"REC-{block.block_id}", "conflictId": f"case-{block.block_id}",
            "strategy": f"Use the first suitable gap in the saved timetable for {case.description}" if is_scheduled else "No safe maintenance time is available in this saved timetable",
            "confidence": 0.82 if is_scheduled else 0.25, "delaySavedMinutes": 0.0,
            "throughputDeltaPct": 0.0, "computeMs": 1,
            "steps": [
                {"trainNumber": "Saved timetable", "action": "Keep clear", "detail": "Keep the selected gap clear of scheduled trains, including its safety buffer."},
                {"trainNumber": "Safety checks", "action": "Confirm", "detail": f"This work needs: {', '.join(requirements)}."},
                {"trainNumber": "After the work", "action": "Test and restore", "detail": "Test the asset and close the simulated maintenance record."},
            ],
        })

    gaps = _derive_replay_gaps(request)
    window_candidates = [{
        "id": f"GAP-{gap['start'].strftime('%H%M')}",
        "sectionId": request.train_movements[0].section_id if request.train_movements else "unknown",
        "start": gap["start"].isoformat(), "end": gap["end"].isoformat(),
        "usableMinutes": int((gap["end"] - gap["start"]).total_seconds() / 60),
        "headwayBufferMinutes": 15, "occupiedByTrainIds": gap["occupied_by_train_ids"],
    } for gap in gaps]

    # ── ML decision intelligence ────────────────────────────────────────────
    # One feed entry per block/case-day carrying the ML score that ranked the
    # decision, so the UI can show live which decisions were ML-driven.
    ml_info = result.ml_info or {}
    ml_scores = ml_info.get("scores", {})
    ml_stats = dict(ml_info.get("stats", {}) or {})
    feed: List[dict] = []
    for block in result.schedule:
        case = cases.get(block.task_id)
        day_match = re.search(r"-d(\d+)(?:-DEFERRED)?$", block.block_id)
        feed.append({
            "blockId": block.block_id,
            "caseId": block.task_id,
            "department": block.department,
            "sectionId": block.track_section,
            "label": case.description if case else block.task_id,
            "mlScore": round(float(ml_scores.get(block.task_id, 0.0)), 3),
            "tier": _ml_tier(float(ml_scores.get(block.task_id, 0.0))),
            "status": block.status.value,
            "day": int(day_match.group(1)) if day_match else 0,
        })
    feed.sort(key=lambda x: -x["mlScore"])
    ml_stats["decisionFeed"] = feed
    ml_stats["decisionsMade"] = len(feed)
    ml_stats["scheduledHighRisk"] = sum(
        1 for f in feed
        if f["status"] != ScheduleStatus.DEFERRED.value and f["tier"] in ("critical", "high")
    )
    ml_stats["deferredCount"] = sum(
        1 for f in feed if f["status"] == ScheduleStatus.DEFERRED.value
    )

    # ── Triage queue ─────────────────────────────────────────────────────────
    triage = _compute_triage(request, result, ml_scores)

    # Per-day breakdown. Blocks carry a day tag (-dN) in their id, which is
    # reliable for both scheduled and deferred entries.
    days = _horizon_planning_days(request)
    by_day: dict[int, list] = {d: [] for d in range(days)}
    for block in result.schedule:
        day_match = re.search(r"-d(\d+)(?:-DEFERRED)?$", block.block_id)
        day_index = int(day_match.group(1)) if day_match else 0
        if 0 <= day_index < days:
            by_day[day_index].append(block)
    day_breakdown = []
    anchor = request.replay_context.planning_start.date()
    horizon_minutes = max(1, (request.replay_context.planning_end - request.replay_context.planning_start).total_seconds() / 60)
    for offset in range(days):
        blocks = by_day[offset]
        scheduled = [b for b in blocks if b.status == ScheduleStatus.SCHEDULED]
        day_date = anchor + timedelta(days=offset)
        work_min = sum(b.duration_minutes for b in scheduled)
        day_breakdown.append({
            "date": day_date.isoformat(),
            "label": day_date.strftime("%a %d %b"),
            "totalRequests": len(blocks),
            "scheduled": len(scheduled),
            "deferred": len(blocks) - len(scheduled),
            "workMinutes": work_min,
            "availabilityGainPct": round(min((work_min / horizon_minutes) * 100, 100.0), 1),
        })

    return {
        "mode": "replay",
        "horizon": request.replay_context.horizon,
        "planningDays": _horizon_planning_days(request),
        "replayContext": {
            "corridorId": request.replay_context.corridor_id,
            "corridorLabel": request.replay_context.corridor_label,
            "planningStart": request.replay_context.planning_start.isoformat(),
            "planningEnd": request.replay_context.planning_end.isoformat(),
            "capturedAt": request.replay_context.captured_at.isoformat(),
            "sourceSystem": request.replay_context.source_system,
            "sourceNote": request.replay_context.source_note,
            "horizon": request.replay_context.horizon,
            "planningDays": request.replay_context.planning_days,
        },
        "trainMovements": [{
            "id": movement.id, "number": movement.train_number, "name": movement.train_name,
            "trainClass": movement.train_class, "sectionId": movement.section_id,
            "direction": movement.direction, "scheduledEntry": movement.scheduled_entry.isoformat(),
            "scheduledExit": movement.scheduled_exit.isoformat(),
        } for movement in request.train_movements],
        "windowCandidates": window_candidates,
        "totalTasks": result.total_tasks, "scheduledTasks": result.scheduled_tasks,
        "conflictsDetected": result.conflicts_detected,
        "assetAvailabilityGain": result.asset_availability_gain,
        "schedule": [_camel_case_block(block) for block in result.schedule],
        "recommendations": recommendations,
        "dayBreakdown": day_breakdown,
        "mlStats": ml_stats,
        "triage": triage,
    }


# ============= API ENDPOINTS =============

@app.get("/health")
async def health():
    """Liveness check. Also reports whether the .NET API is reachable."""
    dotnet_status = "unknown"
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            r = await client.get(f"{DOTNET_API_BASE}/api/optimization/data")
            dotnet_status = "reachable" if r.is_success else f"error ({r.status_code})"
    except Exception:
        dotnet_status = "unreachable"
    return {
        "status": "healthy",
        "engine": "Greedy-Shadow V2",
        "dotnet_api": dotnet_status,
        "dotnet_url": DOTNET_DATA_URL,
        "ml_prioritization": _ML_STATUS,
        "ml_active": isinstance(_ML_PRIORITIZER, PriorityModel) and _ML_PRIORITIZER.trained,
    }


@app.post("/optimize", response_model=OptimizationResult, response_model_exclude_none=True)
async def optimize_schedule(request: OptimizationRequest):
    """
    Primary endpoint — called by the .NET OptimizationController.
    .NET sends {tasks, corridor_windows} in the POST body; we run the engine and return the result.
    """
    if not request.tasks or not request.corridor_windows:
        raise HTTPException(status_code=400, detail="Request body must contain 'tasks' and 'corridor_windows'.")
    logger.info("POST /optimize — %d tasks, %d windows", len(request.tasks), len(request.corridor_windows))
    defects = _load_defects_by_task()
    engine = SchedulingEngine(request.tasks, request.corridor_windows, defects)
    result = engine.optimize()
    logger.info(
        "Optimization done: %d/%d scheduled, %d shadow blocks, %d deferred, %.1f%% availability gain",
        result.scheduled_tasks, result.total_tasks,
        result.shadow_blocks, result.conflicts_detected,
        result.asset_availability_gain,
    )
    return result


@app.post("/replay/optimize")
async def optimize_replay_schedule(request: ReplayOptimizationRequest):
    """Run an offline, procedure-driven plan from a frozen public timetable snapshot."""
    if request.replay_context.data_mode != "replay":
        raise HTTPException(status_code=422, detail="Replay optimization requires data_mode='replay'.")
    if not request.train_movements or not request.maintenance_cases:
        raise HTTPException(status_code=400, detail="Replay requires train movements and maintenance cases.")
    if request.replay_context.horizon not in ("daily", "weekly", "monthly"):
        raise HTTPException(status_code=422, detail=f"Unsupported horizon: {request.replay_context.horizon}")
    return _replay_response(request, optimize_replay(request))


@app.post("/replay/triage")
async def replay_triage(request: ReplayOptimizationRequest):
    """
    Triage-only view of the replay plan: runs the same ML-ranked optimiser and
    returns just the rollup + ranked item list, so clients (or the .NET bridge)
    can pull the triage queue without consuming the full schedule payload.
    """
    if request.replay_context.data_mode != "replay":
        raise HTTPException(status_code=422, detail="Triage requires data_mode='replay'.")
    if not request.maintenance_cases:
        raise HTTPException(status_code=400, detail="Triage requires maintenance cases.")
    response = _replay_response(request, optimize_replay(request))
    return {
        "rollup": response["triage"]["rollup"],
        "items": response["triage"]["items"],
        "mlStats": response["mlStats"],
    }


@app.get("/data-optimize", response_model=OptimizationResult, response_model_exclude_none=True)
async def data_optimize():
    """
    Convenience endpoint: fetch data from the .NET API, run the engine, return the result.
    Falls back to reading JSON files directly if the .NET API is unreachable.
    Useful for quick end-to-end tests without triggering the full .NET → Python bridge.
    """
    try:
        data = await _fetch_data_from_dotnet()
        source = DOTNET_DATA_URL
    except HTTPException as e:
        if e.status_code in (503, 504):
            logger.warning(".NET API unreachable (%s). Falling back to local JSON files.", e.detail)
            data   = _load_data_from_files()
            source = "local JSON files (fallback)"
        else:
            raise

    logger.info("Running optimization via /data-optimize (source: %s)", source)
    defects = _load_defects_by_task()
    engine = SchedulingEngine(data.tasks, data.corridor_windows, defects)
    return engine.optimize()


@app.get("/data-optimize-live", response_model=OptimizationResult, response_model_exclude_none=True)
async def data_optimize_live():
    """
    Same as /data-optimize but NEVER falls back to files.
    Use this to explicitly test that the .NET → Python data bridge is working.
    Returns 503 if the .NET API is not reachable.
    """
    data = await _fetch_data_from_dotnet()   # raises 503 if .NET is down — intentional
    logger.info("Running optimization via /data-optimize-live (source: .NET API)")
    defects = _load_defects_by_task()
    engine = SchedulingEngine(data.tasks, data.corridor_windows, defects)
    return engine.optimize()


@app.get("/model")
def model_status():
    """Expose ML prioritization status + calibration for the audit/demo UI."""
    used = isinstance(_ML_PRIORITIZER, PriorityModel) and _ML_PRIORITIZER.trained
    return {
        "engine": "GradientBoosting + IsotonicCalibration",
        "status": _ML_STATUS,
        "active_in_scheduler": used,
        "metrics": _ML_PRIORITIZER.metrics if used else {},
        "feature_count": _ML_PRIORITIZER.metrics.get("feature_count") if used else 0,
    }


@app.get("/test-optimize", response_model=OptimizationResult, response_model_exclude_none=True)
async def test_optimize():
    """
    Self-contained smoke test using three hardcoded tasks and one window.
    No external dependencies — useful to verify the scheduling logic in isolation.
    """
    sample_tasks = [
        MaintenanceTask(
            task_id="TSK-TEST-001", department="Engineering", task_type="Preventive Maintenance",
            description="Test rail grinding task", track_section="NDLS-GZB-UP",
            location_km="KM 5.0/0-5.5/0", duration_minutes=45,
            priority="Critical", criticality_score=0.9,
            requested_by="ENG/SSE-1", requested_date=datetime.now()
        ),
        MaintenanceTask(
            task_id="TSK-TEST-002", department="Signal & Telecommunication", task_type="Inspection",
            description="Test signal inspection", track_section="NDLS-GZB-UP",
            location_km="KM 5.5/0-6.0/0", duration_minutes=30,
            priority="High", criticality_score=0.8,
            requested_by="S&T/JE-1", requested_date=datetime.now()
        ),
        MaintenanceTask(
            task_id="TSK-TEST-003", department="Traction Distribution", task_type="Preventive Maintenance",
            description="Test OHE maintenance", track_section="NDLS-GZB-UP",
            location_km="KM 6.0/0-6.5/0", duration_minutes=60,
            priority="Medium", criticality_score=0.7,
            requested_by="TRA/JE-1", requested_date=datetime.now()
        ),
    ]
    sample_windows = [
        CorridorWindow(
            window_id="WIN-TEST-001", track_section="NDLS-GZB-UP",
            available_start=datetime.now().replace(hour=22, minute=0, second=0, microsecond=0),
            available_end=(datetime.now().replace(hour=22, minute=0, second=0, microsecond=0) + timedelta(hours=7)),
            duration_minutes=420, window_type="Night Block", constraints=[]
        ),
    ]
    engine = SchedulingEngine(sample_tasks, sample_windows)
    return engine.optimize()


if __name__ == "__main__":
    import uvicorn
    logging.basicConfig(level=logging.INFO)
    uvicorn.run(app, host="0.0.0.0", port=8000)

