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
import httpx
import json
import os
import logging
from enum import Enum
from collections import defaultdict

logger = logging.getLogger("railblock")

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
    
    @classmethod
    def calculate_priority_score(cls, task: MaintenanceTask) -> float:
        priority_weight = cls.PRIORITY_WEIGHTS.get(task.priority, 0.5)
        dept_factor = cls.DEPARTMENT_CRITICALITY.get(task.department, 0.7)
        
        score = (
            priority_weight * 0.5 +
            task.criticality_score * 0.3 +
            dept_factor * 0.2
        )
        return round(score, 3)
    
    @classmethod
    def rank_tasks(cls, tasks: List[MaintenanceTask]) -> List[MaintenanceTask]:
        return sorted(tasks, key=lambda t: cls.calculate_priority_score(t), reverse=True)

# ============= SCHEDULING ENGINE =============

class SchedulingEngine:
    def __init__(self, tasks: List[MaintenanceTask], windows: List[CorridorWindow]):
        self.tasks = PrioritizationEngine.rank_tasks(tasks)
        self.windows = sorted(windows, key=lambda w: w.available_start)
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


def _replay_priority(case: MaintenanceCase) -> int:
    return {"emergency": 0, "urgent": 1, "planned": 2}.get(case.urgency, 3)


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


def optimize_replay(request: ReplayOptimizationRequest) -> OptimizationResult:
    """Schedule procedure-driven cases into gaps derived from a frozen timetable."""
    profiles = {profile.id: profile for profile in request.procedure_profiles}
    gaps = _derive_replay_gaps(request)
    used = []
    schedule = []
    scheduled_count = 0

    for case in sorted(request.maintenance_cases, key=_replay_priority):
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
        if chosen:
            access = []
            if profile.traffic_block_required: access.append("temporary track closure")
            if profile.power_block_required: access.append("electrical isolation")
            if profile.disconnection_notice_required: access.append("equipment disconnection notice")
            if profile.permit_to_work_required: access.append("formal safety clearance")
            work_start = chosen[0] + timedelta(minutes=profile.minimum_setup_minutes)
            work_end = work_start + timedelta(minutes=case.estimated_work_minutes)
            schedule.append(ScheduledBlock(
                block_id=f"RPL-{case.case_id}", task_id=case.case_id, department=case.department,
                track_section=case.section_id, location_km=case.location_reference,
                scheduled_start=work_start, scheduled_end=work_end,
                duration_minutes=case.estimated_work_minutes, priority=priority,
                criticality_score={"emergency": .95, "urgent": .8, "planned": .5}.get(case.urgency, .3),
                window_id=f"GAP-{chosen[0].strftime('%H%M')}", status=ScheduleStatus.SCHEDULED,
                conflict_reason=f"Safety requirements: {', '.join(access)}."
            ))
            used.append(chosen)
            scheduled_count += 1
        else:
            schedule.append(ScheduledBlock(
                block_id=f"RPL-{case.case_id}-DEFERRED", task_id=case.case_id, department=case.department,
                track_section=case.section_id, location_km=case.location_reference,
                scheduled_start=datetime.min, scheduled_end=datetime.min,
                duration_minutes=case.estimated_work_minutes, priority=priority,
                criticality_score={"emergency": .95, "urgent": .8, "planned": .5}.get(case.urgency, .3),
                window_id="NONE", status=ScheduleStatus.DEFERRED,
                conflict_reason="No safe gap in the saved timetable is long enough for this work."
            ))

    return OptimizationResult(
        total_tasks=len(request.maintenance_cases), scheduled_tasks=scheduled_count,
        shadow_blocks=0, conflicts_detected=len(request.maintenance_cases) - scheduled_count,
        asset_availability_gain=0.0, schedule=schedule
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
            "id": f"REC-{case.case_id}", "conflictId": f"case-{case.case_id}",
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

    return {
        "mode": "replay",
        "replayContext": {
            "corridorId": request.replay_context.corridor_id,
            "corridorLabel": request.replay_context.corridor_label,
            "planningStart": request.replay_context.planning_start.isoformat(),
            "planningEnd": request.replay_context.planning_end.isoformat(),
            "capturedAt": request.replay_context.captured_at.isoformat(),
            "sourceSystem": request.replay_context.source_system,
            "sourceNote": request.replay_context.source_note,
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
        "schedule": [_camel_case_block(block) for block in result.schedule],
        "recommendations": recommendations,
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
    }


@app.post("/optimize", response_model=OptimizationResult)
async def optimize_schedule(request: OptimizationRequest):
    """
    Primary endpoint — called by the .NET OptimizationController.
    .NET sends {tasks, corridor_windows} in the POST body; we run the engine and return the result.
    """
    if not request.tasks or not request.corridor_windows:
        raise HTTPException(status_code=400, detail="Request body must contain 'tasks' and 'corridor_windows'.")
    logger.info("POST /optimize — %d tasks, %d windows", len(request.tasks), len(request.corridor_windows))
    engine = SchedulingEngine(request.tasks, request.corridor_windows)
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
    return _replay_response(request, optimize_replay(request))


@app.get("/data-optimize", response_model=OptimizationResult)
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
    engine = SchedulingEngine(data.tasks, data.corridor_windows)
    return engine.optimize()


@app.get("/data-optimize-live", response_model=OptimizationResult)
async def data_optimize_live():
    """
    Same as /data-optimize but NEVER falls back to files.
    Use this to explicitly test that the .NET → Python data bridge is working.
    Returns 503 if the .NET API is not reachable.
    """
    data = await _fetch_data_from_dotnet()   # raises 503 if .NET is down — intentional
    logger.info("Running optimization via /data-optimize-live (source: .NET API)")
    engine = SchedulingEngine(data.tasks, data.corridor_windows)
    return engine.optimize()


@app.get("/test-optimize", response_model=OptimizationResult)
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
