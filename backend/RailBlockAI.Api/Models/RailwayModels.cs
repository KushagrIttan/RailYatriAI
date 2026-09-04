namespace RailBlockAI.Api.Models;

public enum Department
{
    Engineering,
    SignalAndTelecommunication,
    TractionDistribution
}

public enum Priority
{
    Critical,
    High,
    Medium,
    Low
}

public enum BlockStatus
{
    Requested,
    PendingReview,
    Approved,
    Rejected,
    Scheduled,
    InProgress,
    Completed
}

public enum TaskType
{
    PreventiveMaintenance,
    CorrectiveMaintenance,
    Inspection,
    EmergencyRepair
}

public record TrackSection
{
    public string SectionId { get; init; } = string.Empty;
    public string Name { get; init; } = string.Empty;
    public string FromStation { get; init; } = string.Empty;
    public string ToStation { get; init; } = string.Empty;
    public double LengthKm { get; init; }
    public bool Electrified { get; init; }
    public int MaxSpeedKmph { get; init; }
}

public record Defect
{
    public string DefectId { get; init; } = string.Empty;
    public string TaskId { get; init; } = string.Empty;
    public string Department { get; init; } = string.Empty;
    public string Severity { get; init; } = string.Empty;
    public string Description { get; init; } = string.Empty;
    public string LocationKm { get; init; } = string.Empty;
    public DateTime ReportedDate { get; init; }
    public int AgeDays { get; init; }
}

public record MaintenanceTask
{
    public string TaskId { get; init; } = string.Empty;
    public string Department { get; init; } = string.Empty;
    public string TaskType { get; init; } = string.Empty;
    public string Description { get; init; } = string.Empty;
    public string TrackSection { get; init; } = string.Empty;
    public string LocationKm { get; init; } = string.Empty;
    public int DurationMinutes { get; init; }
    public List<string> RequiredResources { get; init; } = new();
    public string Priority { get; init; } = string.Empty;
    public double CriticalityScore { get; init; }
    public List<string> Dependencies { get; init; } = new();
    public string RequestedBy { get; init; } = string.Empty;
    public DateTime RequestedDate { get; init; }
}

public record BlockRequest
{
    public string BlockId { get; init; } = string.Empty;
    public List<string> TaskIds { get; init; } = new();
    public string Department { get; init; } = string.Empty;
    public string TrackSection { get; init; } = string.Empty;
    public DateTime RequestedStart { get; init; }
    public DateTime RequestedEnd { get; init; }
    public int DurationMinutes { get; init; }
    public string Status { get; init; } = string.Empty;
    public string Justification { get; init; } = string.Empty;
    public string RequestedBy { get; init; } = string.Empty;
    public string? ApprovedBy { get; init; }
    public string? RejectionReason { get; init; }
}

public record CorridorWindow
{
    public string WindowId { get; init; } = string.Empty;
    public string TrackSection { get; init; } = string.Empty;
    public DateTime AvailableStart { get; init; }
    public DateTime AvailableEnd { get; init; }
    public int DurationMinutes { get; init; }
    public string WindowType { get; init; } = string.Empty;
    public List<string> Constraints { get; init; } = new();
}

public record TrainSchedule
{
    public string TrainNumber { get; init; } = string.Empty;
    public string TrainName { get; init; } = string.Empty;
    public string TrackSection { get; init; } = string.Empty;
    public DateTime ArrivalTime { get; init; }
    public DateTime DepartureTime { get; init; }
    public string TrainType { get; init; } = string.Empty;
}
