"""
Data schemas for RailBlock AI synthetic data generation.
Models the structure of Indian Railways' operational systems:
- BDMS (Block & Disconnection Management System)
- TMS (Track Management System)
- SMMS (Signalling Maintenance & Management System)
- TDMS (Traction Distribution Management System)
- COA (Control Office Application)
"""

from dataclasses import dataclass, asdict
from typing import List, Optional
from datetime import datetime
from enum import Enum

class Department(str, Enum):
    ENGINEERING = "Engineering"
    SIGNALING = "Signal & Telecommunication"
    TRACTION = "Traction Distribution"

class Priority(str, Enum):
    CRITICAL = "Critical"  # Category A defects
    HIGH = "High"          # Category B defects
    MEDIUM = "Medium"      # Category C defects
    LOW = "Low"            # Routine maintenance

class BlockStatus(str, Enum):
    REQUESTED = "Requested"
    PENDING_REVIEW = "Pending Review"
    APPROVED = "Approved"
    REJECTED = "Rejected"
    SCHEDULED = "Scheduled"
    IN_PROGRESS = "In Progress"
    COMPLETED = "Completed"

class TaskType(str, Enum):
    PREVENTIVE = "Preventive Maintenance"
    CORRECTIVE = "Corrective Maintenance"
    INSPECTION = "Inspection"
    EMERGENCY = "Emergency Repair"

@dataclass
class TrackSection:
    section_id: str
    name: str
    from_station: str
    to_station: str
    length_km: float
    electrified: bool
    max_speed_kmph: int

@dataclass
class Defect:
    defect_id: str
    task_id: str
    department: str
    severity: str  # Critical/High/Medium/Low
    description: str
    location_km: str  # e.g., "KM 124/2-126/5"
    reported_date: str
    age_days: int

@dataclass
class MaintenanceTask:
    task_id: str
    department: str
    task_type: str
    description: str
    track_section: str
    location_km: str
    duration_minutes: int
    required_resources: List[str]
    priority: str
    criticality_score: float  # 0.0 to 1.0
    dependencies: List[str]  # task_ids that must complete first
    requested_by: str
    requested_date: str

@dataclass
class BlockRequest:
    block_id: str
    task_ids: List[str]
    department: str
    track_section: str
    requested_start: str  # ISO datetime
    requested_end: str
    duration_minutes: int
    status: str
    justification: str
    requested_by: str
    approved_by: Optional[str] = None
    rejection_reason: Optional[str] = None

@dataclass
class CorridorWindow:
    window_id: str
    track_section: str
    available_start: str  # ISO datetime
    available_end: str
    duration_minutes: int
    window_type: str  # "Freight-Free", "Passenger-Free", "Night Block", "Emergency"
    constraints: List[str]  # e.g., ["No OHE work during passenger hours"]

@dataclass
class TrainSchedule:
    train_number: str
    train_name: str
    track_section: str
    arrival_time: str
    departure_time: str
    train_type: str  # "Passenger", "Mail/Express", "Freight", "Suburban"

def to_dict(obj):
    """Convert dataclass to dict for JSON serialization."""
    if isinstance(obj, list):
        return [to_dict(item) for item in obj]
    elif hasattr(obj, '__dataclass_fields__'):
        return {k: to_dict(v) for k, v in asdict(obj).items()}
    else:
        return obj
