"""
RailBlock AI - Optimization Engine
The "Brain" that schedules maintenance tasks into corridor windows.
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime, timedelta
import json
import os
from enum import Enum
from collections import defaultdict

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

# ============= API ENDPOINTS =============

@app.post("/optimize", response_model=OptimizationResult)
async def optimize_schedule(request: OptimizationRequest):
    if not request.tasks or not request.corridor_windows:
        raise HTTPException(status_code=400, detail="Missing tasks or windows")
    engine = SchedulingEngine(request.tasks, request.corridor_windows)
    return engine.optimize()

@app.get("/health")
async def health(): return {"status": "healthy", "engine": "Greedy-Shadow V2"}

@app.get("/test-optimize", response_model=OptimizationResult)
async def test_optimize():
    """Quick self-test using built-in sample data."""
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
            available_start=datetime.now().replace(hour=22, minute=0, second=0),
            available_end=datetime.now().replace(hour=23, minute=59, second=0) + timedelta(hours=5),
            duration_minutes=420, window_type="Night Block", constraints=[]
        ),
    ]
    engine = SchedulingEngine(sample_tasks, sample_windows)
    return engine.optimize()

@app.get("/data-optimize", response_model=OptimizationResult)
async def data_optimize():
    """Run optimization on the project's data/*.json files directly (no .NET bridge needed)."""
    data_dir = os.path.join(os.path.dirname(__file__), "..", "..", "data")
    data_dir = os.path.abspath(data_dir)
    
    try:
        with open(os.path.join(data_dir, "maintenance_tasks.json"), "r") as f:
            raw_tasks = json.load(f)
        with open(os.path.join(data_dir, "corridor_windows.json"), "r") as f:
            raw_windows = json.load(f)
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=f"Data file not found: {e}")
    
    tasks = [MaintenanceTask(**t) for t in raw_tasks]
    windows = [CorridorWindow(**w) for w in raw_windows]
    
    engine = SchedulingEngine(tasks, windows)
    return engine.optimize()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
