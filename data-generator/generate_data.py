"""
Synthetic Data Generator for RailBlock AI
Generates realistic Indian Railways operational data for demo purposes.
"""

import json
import random
from datetime import datetime, timedelta
from typing import List
from schemas import (
    TrackSection, Defect, MaintenanceTask, BlockRequest, 
    CorridorWindow, TrainSchedule, Department, Priority, 
    BlockStatus, TaskType, to_dict
)

# Seed for reproducibility
random.seed(42)

# Configuration
START_DATE = datetime(2026, 9, 8)  # Demo date
NUM_DAYS = 14
STATIONS = ["NDLS", "GZB", "MTC"]  # New Delhi, Ghaziabad, Meerut City
TRACK_SECTIONS = [
    {"id": "NDLS-GZB-UP", "from": "NDLS", "to": "GZB", "length": 19.2},
    {"id": "GZB-MTC-DN", "from": "GZB", "to": "MTC", "length": 52.8}
]

# Realistic maintenance activities by department
ENGINEERING_ACTIVITIES = [
    "Rail Grinding", "Ballast Renewal", "Track Alignment", 
    "Sleeper Replacement", "Welding Joint Repair", "Track Inspection"
]

SIGNALING_ACTIVITIES = [
    "Signal Lamp Replacement", "Point Machine Maintenance",
    "Track Circuit Testing", "Relay Room Inspection", "Cable Jointing"
]

TRACTION_ACTIVITIES = [
    "OHE Insulator Cleaning", "Catenary Wire Tensioning",
    "Pantograph Inspection", "Contact Wire Replacement", "Feeder Pillar Maintenance"
]

DEFECT_DESCRIPTIONS = {
    Department.ENGINEERING: [
        "Rail wear exceeding permissible limits",
        "Track geometry deviation detected",
        "Broken fishplate on joint",
        "Ballast shoulder erosion"
    ],
    Department.SIGNALING: [
        "Signal aspect failure - red not showing",
        "Point motor overheating",
        "Track circuit count mismatch",
        "Cable insulation damage"
    ],
    Department.TRACTION: [
        "OHE contact wire burn mark",
        "Insulator flashover damage",
        "Dropper wire broken",
        "Feeder cable heating"
    ]
}

def generate_track_sections() -> List[TrackSection]:
    """Generate track section master data."""
    sections = []
    for ts in TRACK_SECTIONS:
        sections.append(TrackSection(
            section_id=ts["id"],
            name=f"{ts['from']}-{ts['to']} Section",
            from_station=ts["from"],
            to_station=ts["to"],
            length_km=ts["length"],
            electrified=True,
            max_speed_kmph=110
        ))
    return sections

def generate_defects(num_defects: int = 25) -> List[Defect]:
    """Generate realistic defect reports."""
    defects = []
    for i in range(num_defects):
        dept = random.choice(list(Department))
        severity = random.choice(list(Priority))
        age_days = random.randint(1, 90)
        reported_date = START_DATE - timedelta(days=age_days)
        
        section = random.choice(TRACK_SECTIONS)
        km_start = round(random.uniform(0, section["length"]), 1)
        km_end = round(km_start + random.uniform(0.1, 2.0), 1)
        
        defects.append(Defect(
            defect_id=f"DEF-{dept.value[:3].upper()}-{i+1:04d}",
            task_id=f"TSK-{dept.value[:3].upper()}-{i+1:04d}",
            department=dept.value,
            severity=severity.value,
            description=random.choice(DEFECT_DESCRIPTIONS[dept]),
            location_km=f"KM {km_start}/{int((km_start % 1) * 10)}-{km_end}/{int((km_end % 1) * 10)}",
            reported_date=reported_date.isoformat(),
            age_days=age_days
        ))
    return defects

def calculate_criticality(priority: Priority, age_days: int, dept: Department) -> float:
    """Calculate criticality score (0.0 to 1.0)."""
    priority_weight = {
        Priority.CRITICAL: 0.9,
        Priority.HIGH: 0.7,
        Priority.MEDIUM: 0.5,
        Priority.LOW: 0.3
    }
    
    age_factor = min(age_days / 90.0, 1.0) * 0.3  # Max 0.3 contribution
    dept_factor = 0.1 if dept == Department.SIGNALING else 0.0  # Safety-critical
    
    return min(priority_weight[priority] + age_factor + dept_factor, 1.0)

def generate_maintenance_tasks(defects: List[Defect]) -> List[MaintenanceTask]:
    """Generate maintenance tasks from defects + routine work."""
    tasks = []
    
    # Tasks from defects (corrective)
    for defect in defects:
        dept = Department(defect.department)
        priority = Priority(defect.severity)
        
        if dept == Department.ENGINEERING:
            activity = random.choice(ENGINEERING_ACTIVITIES)
            duration = random.randint(60, 180)
            resources = ["Track Machine", "Welding Unit", "Ballast Regulator"]
        elif dept == Department.SIGNALING:
            activity = random.choice(SIGNALING_ACTIVITIES)
            duration = random.randint(45, 120)
            resources = ["Signal Tester", "Relay Test Panel", "Cable Jointer"]
        else:  # TRACTION
            activity = random.choice(TRACTION_ACTIVITIES)
            duration = random.randint(30, 90)
            resources = ["OHE Ladder", "Insulation Tester", "Pantograph Gauge"]
        
        criticality = calculate_criticality(priority, defect.age_days, dept)
        
        tasks.append(MaintenanceTask(
            task_id=defect.task_id,
            department=dept.value,
            task_type=TaskType.CORRECTIVE.value,
            description=f"{activity} - {defect.description}",
            track_section=random.choice(TRACK_SECTIONS)["id"],
            location_km=defect.location_km,
            duration_minutes=duration,
            required_resources=random.sample(resources, k=random.randint(1, 2)),
            priority=priority.value,
            criticality_score=round(criticality, 2),
            dependencies=[],
            requested_by=f"{dept.value[:3].upper()}/JE-{random.randint(1,5)}",
            requested_date=(START_DATE - timedelta(days=random.randint(1, 7))).isoformat()
        ))
    
    # Add routine preventive tasks
    for dept in Department:
        for _ in range(3):
            section = random.choice(TRACK_SECTIONS)
            tasks.append(MaintenanceTask(
                task_id=f"TSK-{dept.value[:3].upper()}-P{random.randint(100,999)}",
                department=dept.value,
                task_type=TaskType.PREVENTIVE.value,
                description=f"Scheduled {random.choice([ENGINEERING_ACTIVITIES, SIGNALING_ACTIVITIES, TRACTION_ACTIVITIES][list(Department).index(dept)][0])}",
                track_section=section["id"],
                location_km=f"KM {random.randint(0, int(section['length']))}/0",
                duration_minutes=random.randint(60, 120),
                required_resources=["Standard Toolkit"],
                priority=Priority.MEDIUM.value,
                criticality_score=0.4,
                dependencies=[],
                requested_by=f"{dept.value[:3].upper()}/SSE",
                requested_date=(START_DATE - timedelta(days=random.randint(10, 20))).isoformat()
            ))
    
    return tasks

def generate_block_requests(tasks: List[MaintenanceTask]) -> List[BlockRequest]:
    """Generate block requests for high-priority tasks."""
    blocks = []
    high_priority_tasks = [t for t in tasks if t.criticality_score >= 0.6]
    
    for i, task in enumerate(high_priority_tasks[:15]):  # Limit to 15 requests
        start_time = START_DATE + timedelta(
            days=random.randint(0, 7),
            hours=random.choice([2, 10, 14, 22])  # Typical block windows
        )
        
        blocks.append(BlockRequest(
            block_id=f"BLK-{task.department[:3].upper()}-{i+1:04d}",
            task_ids=[task.task_id],
            department=task.department,
            track_section=task.track_section,
            requested_start=start_time.isoformat(),
            requested_end=(start_time + timedelta(minutes=task.duration_minutes)).isoformat(),
            duration_minutes=task.duration_minutes,
            status=random.choice([BlockStatus.REQUESTED.value, BlockStatus.PENDING_REVIEW.value]),
            justification=f"{task.priority} priority - {task.description[:50]}",
            requested_by=task.requested_by
        ))
    
    return blocks

def generate_corridor_windows() -> List[CorridorWindow]:
    """Generate available corridor windows (freight-free/night blocks)."""
    windows = []
    
    for day in range(NUM_DAYS):
        date = START_DATE + timedelta(days=day)
        
        for section in TRACK_SECTIONS:
            # Night block (22:00 - 05:00)
            night_start = date.replace(hour=22, minute=0)
            windows.append(CorridorWindow(
                window_id=f"COR-{section['id']}-{day:02d}-NIGHT",
                track_section=section["id"],
                available_start=night_start.isoformat(),
                available_end=(night_start + timedelta(hours=7)).isoformat(),
                duration_minutes=420,
                window_type="Night Block",
                constraints=["No passenger train interference", "OHE work allowed"]
            ))
            
            # Afternoon freight-free (14:00 - 16:30)
            afternoon_start = date.replace(hour=14, minute=0)
            windows.append(CorridorWindow(
                window_id=f"COR-{section['id']}-{day:02d}-AFT",
                track_section=section["id"],
                available_start=afternoon_start.isoformat(),
                available_end=(afternoon_start + timedelta(hours=2.5)).isoformat(),
                duration_minutes=150,
                window_type="Freight-Free Window",
                constraints=["Passenger trains running", "No OHE disconnection"]
            ))
    
    return windows

def generate_train_schedule() -> List[TrainSchedule]:
    """Generate sample train timetable."""
    trains = []
    train_data = [
        ("12413", "Jammu Tawi Express", "Mail/Express"),
        ("14217", "Unchahar Express", "Mail/Express"),
        ("54321", "MEMU Passenger", "Passenger"),
        ("60001", "Goods Train", "Freight")
    ]
    
    for day in range(3):  # Just a few days for reference
        date = START_DATE + timedelta(days=day)
        for train_num, train_name, train_type in train_data:
            for section in TRACK_SECTIONS:
                arrival = date.replace(hour=random.randint(6, 20), minute=random.randint(0, 59))
                trains.append(TrainSchedule(
                    train_number=train_num,
                    train_name=train_name,
                    track_section=section["id"],
                    arrival_time=arrival.isoformat(),
                    departure_time=(arrival + timedelta(minutes=random.randint(2, 10))).isoformat(),
                    train_type=train_type
                ))
    
    return trains

def main():
    """Generate all synthetic data and save to JSON files."""
    print("🚂 RailBlock AI - Synthetic Data Generator")
    print("=" * 50)
    
    # Generate data
    print("Generating track sections...")
    sections = generate_track_sections()
    
    print("Generating defects...")
    defects = generate_defects(25)
    
    print("Generating maintenance tasks...")
    tasks = generate_maintenance_tasks(defects)
    
    print("Generating block requests...")
    blocks = generate_block_requests(tasks)
    
    print("Generating corridor windows...")
    corridors = generate_corridor_windows()
    
    print("Generating train schedule...")
    trains = generate_train_schedule()
    
    # Save to JSON
    output_dir = "../data"
    
    with open(f"{output_dir}/track_sections.json", "w") as f:
        json.dump([to_dict(s) for s in sections], f, indent=2)
    
    with open(f"{output_dir}/defects.json", "w") as f:
        json.dump([to_dict(d) for d in defects], f, indent=2)
    
    with open(f"{output_dir}/maintenance_tasks.json", "w") as f:
        json.dump([to_dict(t) for t in tasks], f, indent=2)
    
    with open(f"{output_dir}/block_requests.json", "w") as f:
        json.dump([to_dict(b) for b in blocks], f, indent=2)
    
    with open(f"{output_dir}/corridor_windows.json", "w") as f:
        json.dump([to_dict(c) for c in corridors], f, indent=2)
    
    with open(f"{output_dir}/train_schedule.json", "w") as f:
        json.dump([to_dict(t) for t in trains], f, indent=2)
    
    print("\n✅ Data generation complete!")
    print(f"   - Track Sections: {len(sections)}")
    print(f"   - Defects: {len(defects)}")
    print(f"   - Maintenance Tasks: {len(tasks)}")
    print(f"   - Block Requests: {len(blocks)}")
    print(f"   - Corridor Windows: {len(corridors)}")
    print(f"   - Train Schedules: {len(trains)}")
    print(f"\n📁 Files saved to: {output_dir}/")

if __name__ == "__main__":
    main()
