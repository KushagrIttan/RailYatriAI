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
    private readonly IReplayBundleService _replayBundleService;

    public OptimizationController(
        IHttpClientFactory httpClientFactory,
        ILogger<OptimizationController> logger,
        IReplayBundleService replayBundleService)
    {
        _httpClientFactory = httpClientFactory;
        _logger = logger;
        _replayBundleService = replayBundleService;
    }

    [HttpPost("generate")]
    public async Task<IActionResult> GenerateOptimizedSchedule(
        [FromQuery] string? horizon = null,
        [FromQuery] int? days = null)
    {
        _logger.LogInformation("=== Replay optimization request received (horizon: {Horizon}, days: {Days}) ===", horizon ?? "daily", days ?? 1);

        try
        {
            using var replayBundle = await _replayBundleService.LoadAsync(HttpContext.RequestAborted);
            var context = replayBundle.RootElement.GetProperty("replay_context");
            _logger.LogInformation(
                "Using frozen replay bundle for {Corridor}, captured {CapturedAt}",
                context.GetProperty("corridor_id").GetString(),
                context.GetProperty("captured_at").GetString());

            // Inject the requested planning horizon into the forwarded bundle.
            var payload = System.Text.Json.Nodes.JsonNode.Parse(replayBundle.RootElement.GetRawText());
            var ctxNode = payload!["replay_context"]!;
            if (!string.IsNullOrWhiteSpace(horizon))
            {
                ctxNode["horizon"] = horizon;
                ctxNode["planning_days"] = horizon.ToLowerInvariant() switch
                {
                    "weekly" => days ?? 7,
                    "monthly" => days ?? 30,
                    _ => days ?? 1,
                };
            }

            var client = _httpClientFactory.CreateClient();
            client.Timeout = TimeSpan.FromSeconds(30);

            using var request = new HttpRequestMessage(HttpMethod.Post, "http://localhost:8000/replay/optimize")
            {
                Content = new StringContent(payload!.ToJsonString(), System.Text.Encoding.UTF8, "application/json")
            };
            var response = await client.SendAsync(request, HttpContext.RequestAborted);

            if (!response.IsSuccessStatusCode)
            {
                var errorContent = await response.Content.ReadAsStringAsync();
                _logger.LogError("Step 2/3 FAILED — Python engine returned {StatusCode}: {Error}",
                    (int)response.StatusCode, errorContent);
                return StatusCode((int)response.StatusCode,
                    $"Python optimization engine returned an error ({(int)response.StatusCode}): {errorContent}");
            }

            var resultJson = await response.Content.ReadAsStringAsync(HttpContext.RequestAborted);
            DataStore.LastOptimizedSchedule = resultJson;
            _logger.LogInformation("Replay optimization complete.");
            return Content(resultJson, "application/json");
        }
        catch (FileNotFoundException ex)
        {
            _logger.LogError(ex, "Replay bundle is missing.");
            return StatusCode(503, "Replay bundle is unavailable. Restore data/replay/dli-gzb/replay_bundle.json.");
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
