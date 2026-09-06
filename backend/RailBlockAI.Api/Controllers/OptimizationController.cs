using Microsoft.AspNetCore.Mvc;
using RailBlockAI.Api.Models;
using RailBlockAI.Api.Services;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;

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
        _logger.LogInformation("=== Optimization Request Received ===");

        // Guard: DataStore must be populated (seeded on startup)
        if (DataStore.MaintenanceTasks.Length == 0 || DataStore.CorridorWindows.Length == 0)
        {
            _logger.LogError("DataStore is empty — data seeding may have failed at startup.");
            return StatusCode(503, "DataStore is not populated. Check that the data/ JSON files exist and the seeder ran successfully on startup.");
        }

        _logger.LogInformation(
            "Step 1/3 — DataStore has {Tasks} maintenance tasks and {Windows} corridor windows",
            DataStore.MaintenanceTasks.Length, DataStore.CorridorWindows.Length);

        try
        {
            // Step 1: Build the payload from DataStore (same logic as GET /data)
            var tasks = DataStore.MaintenanceTasks.Select(t => new {
                task_id          = t.TaskId,
                department       = t.Department,
                task_type        = t.TaskType,
                description      = t.Description,
                track_section    = t.TrackSection,
                location_km      = t.LocationKm,
                duration_minutes = t.DurationMinutes,
                required_resources = t.RequiredResources,
                priority         = t.Priority,
                criticality_score = t.CriticalityScore,
                dependencies     = t.Dependencies,
                requested_by     = t.RequestedBy,
                requested_date   = t.RequestedDate
            }).ToList();

            var windows = DataStore.CorridorWindows.Select(w => new {
                window_id        = w.WindowId,
                track_section    = w.TrackSection,
                available_start  = w.AvailableStart,
                available_end    = w.AvailableEnd,
                duration_minutes = w.DurationMinutes,
                window_type      = w.WindowType,
                constraints      = w.Constraints
            }).ToList();

            // Step 2: POST to Python optimization engine
            _logger.LogInformation(
                "Step 2/3 — Sending {Tasks} tasks + {Windows} windows to Python engine at http://localhost:8000/optimize",
                tasks.Count, windows.Count);

            var client = _httpClientFactory.CreateClient();
            client.Timeout = TimeSpan.FromSeconds(30);

            var requestBody = new { tasks, corridor_windows = windows };
            var response = await client.PostAsJsonAsync("http://localhost:8000/optimize", requestBody);

            if (!response.IsSuccessStatusCode)
            {
                var errorContent = await response.Content.ReadAsStringAsync();
                _logger.LogError("Step 2/3 FAILED — Python engine returned {StatusCode}: {Error}",
                    (int)response.StatusCode, errorContent);
                return StatusCode((int)response.StatusCode,
                    $"Python optimization engine returned an error ({(int)response.StatusCode}): {errorContent}");
            }

            // Step 3: Deserialize and cache the result
            var jsonOptions = new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true,
                PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower
            };
            var result = await response.Content.ReadFromJsonAsync<OptimizationResult>(jsonOptions);

            if (result == null)
            {
                _logger.LogError("Step 3/3 FAILED — Could not deserialize OptimizationResult from Python response.");
                return BadRequest("Received a successful response from Python but failed to deserialize the result.");
            }

            DataStore.LastOptimizedSchedule = result;

            _logger.LogInformation(
                "Step 3/3 — Optimization complete: {Scheduled}/{Total} tasks scheduled, {Shadow} shadow blocks, {Conflicts} conflicts, {Gain}% availability gain",
                result.ScheduledTasks, result.TotalTasks, result.ShadowBlocks, result.ConflictsDetected, result.AssetAvailabilityGain);
            _logger.LogInformation("=== Optimization Complete ===");

            return Ok(result);
        }
        catch (HttpRequestException ex)
        {
            _logger.LogError(ex, "Could not reach the Python optimization engine at http://localhost:8000. Is it running?");
            return StatusCode(503, "Cannot connect to the Python optimization engine (http://localhost:8000). Start it with: cd backend/optimization-engine && python main.py");
        }
        catch (TaskCanceledException)
        {
            _logger.LogError("Request to Python engine timed out after 30 seconds.");
            return StatusCode(504, "Python optimization engine timed out after 30 seconds.");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unexpected error during optimization");
            return StatusCode(500, ex.Message);
        }
    }

    /// <summary>
    /// Returns tasks + corridor windows in the exact snake_case shape the Python engine expects.
    /// Python can call GET http://localhost:5053/api/optimization/data to fetch its own input.
    /// </summary>
    [HttpGet("data")]
    public IActionResult GetOptimizationData()
    {
        var tasks = DataStore.MaintenanceTasks.Select(t => new {
            task_id          = t.TaskId,
            department       = t.Department,
            task_type        = t.TaskType,
            description      = t.Description,
            track_section    = t.TrackSection,
            location_km      = t.LocationKm,
            duration_minutes = t.DurationMinutes,
            required_resources = t.RequiredResources,
            priority         = t.Priority,
            criticality_score = t.CriticalityScore,
            dependencies     = t.Dependencies,
            requested_by     = t.RequestedBy,
            requested_date   = t.RequestedDate
        }).ToList();

        var windows = DataStore.CorridorWindows.Select(w => new {
            window_id        = w.WindowId,
            track_section    = w.TrackSection,
            available_start  = w.AvailableStart,
            available_end    = w.AvailableEnd,
            duration_minutes = w.DurationMinutes,
            window_type      = w.WindowType,
            constraints      = w.Constraints
        }).ToList();

        _logger.LogInformation(
            "Data endpoint called — returning {TaskCount} tasks and {WindowCount} corridor windows",
            tasks.Count, windows.Count);

        return Ok(new { tasks, corridor_windows = windows });
    }

    [HttpGet("current")]
    public IActionResult GetCurrentSchedule()
    {
        return Ok(DataStore.LastOptimizedSchedule ?? new { message = "No schedule has been generated yet. POST /api/optimization/generate to run the optimizer." });
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
