using Microsoft.AspNetCore.Mvc;
using RailBlockAI.Api.Models;
using RailBlockAI.Api.Services;
using System.Net.Http.Json;

namespace RailBlockAI.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class OptimizationController : ControllerBase
{
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly ILogger<OptimizationController> _logger;

    public OptimizationController(IHttpClientFactory httpClientFactory, ILogger<OptimizationController> logger)
    {
        _httpClientFactory = httpClientFactory;
        _logger = logger;
    }

    [HttpPost("generate")]
    public async Task<IActionResult> GenerateOptimizedSchedule()
    {
        _logger.LogInformation("Triggering AI Optimization...");

        try
        {
            // 1. Gather all current data from our internal DataStore
            var tasks = DataStore.MaintenanceTasks.Select(t => new {
                task_id = t.TaskId,
                department = t.Department,
                task_type = t.TaskType,
                description = t.Description,
                track_section = t.TrackSection,
                location_km = t.LocationKm,
                duration_minutes = t.DurationMinutes,
                required_resources = t.RequiredResources,
                priority = t.Priority,
                criticality_score = t.CriticalityScore,
                dependencies = t.Dependencies,
                requested_by = t.RequestedBy,
                requested_date = t.RequestedDate
            }).ToList();

            var windows = DataStore.CorridorWindows.Select(w => new {
                window_id = w.WindowId,
                track_section = w.TrackSection,
                available_start = w.AvailableStart,
                available_end = w.AvailableEnd,
                duration_minutes = w.DurationMinutes,
                window_type = w.WindowType,
                constraints = w.Constraints
            }).ToList();

            // 2. Call the Python FastAPI Engine
            var client = _httpClientFactory.CreateClient();
            var requestBody = new
            {
                tasks = tasks,
                corridor_windows = windows
            };

            _logger.LogInformation("Sending payload to Python engine...");
            var response = await client.PostAsJsonAsync("http://localhost:8000/optimize", requestBody);

            if (!response.IsSuccessStatusCode)
            {
                var errorContent = await response.Content.ReadAsStringAsync();
                _logger.LogError("Python Optimizer failed: {Error}", errorContent);
                return StatusCode((int)response.StatusCode, errorContent);
            }

            var result = await response.Content.ReadFromJsonAsync<OptimizationResult>();

            if (result == null) return BadRequest("Failed to parse optimization result.");

            // 3. Update the local DataStore
            DataStore.LastOptimizedSchedule = result;

            return Ok(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error during optimization process");
            return StatusCode(500, ex.Message);
        }
    }

    [HttpGet("current")]
    public IActionResult GetCurrentSchedule()
    {
        if (DataStore.LastOptimizedSchedule == null)
            return NotFound("No optimized schedule has been generated yet.");
            
        return Ok(DataStore.LastOptimizedSchedule);
    }
}

// Redefine as class for serialization logic in .NET
public class OptimizationResult
{
    public int TotalTasks { get; set; }
    public int ScheduledTasks { get; set; }
    public int ShadowBlocks { get; set; }
    public int ConflictsDetected { get; set; }
    public float AssetAvailabilityGain { get; set; }
    public List<ScheduledBlock> Schedule { get; set; } = new();
}

public class ScheduledBlock
{
    public string BlockId { get; set; } = string.Empty;
    public string TaskId { get; set; } = string.Empty;
    public string Department { get; set; } = string.Empty;
    public string TrackSection { get; set; } = string.Empty;
    public string LocationKm { get; set; } = string.Empty;
    public DateTime ScheduledStart { get; set; }
    public DateTime ScheduledEnd { get; set; }
    public int DurationMinutes { get; set; }
    public string Priority { get; set; } = string.Empty;
    public double CriticalityScore { get; set; }
    public string WindowId { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public string? ShadowBlockGroup { get; set; }
    public string? ConflictReason { get; set; }
}
