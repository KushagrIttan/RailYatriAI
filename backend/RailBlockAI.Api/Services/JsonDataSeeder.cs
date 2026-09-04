using System.Text.Json;
using RailBlockAI.Api.Models;

namespace RailBlockAI.Api.Services;

public interface IDataSeeder
{
    Task SeedAsync();
}

public class JsonDataSeeder : IDataSeeder
{
    private readonly IWebHostEnvironment _env;
    private readonly ILogger<JsonDataSeeder> _logger;

    public JsonDataSeeder(IWebHostEnvironment env, ILogger<JsonDataSeeder> logger)
    {
        _env = env;
        _logger = logger;
    }

    public async Task SeedAsync()
    {
        _logger.LogInformation("Starting data seeding from JSON files...");
        
        try
        {
            // Path: C:\Users\Kushagr\RailBlockAI\backend\RailBlockAI.Api -> ..\..\data
            var dataPath = Path.Combine(_env.ContentRootPath, "..", "..", "data");
            dataPath = Path.GetFullPath(dataPath);
            
            if (!Directory.Exists(dataPath))
            {
                _logger.LogWarning("Data directory not found at: {Path}", dataPath);
                return;
            }

            var trackSections = await LoadJsonAsync<TrackSection[]>(Path.Combine(dataPath, "track_sections.json"));
            var defects = await LoadJsonAsync<Defect[]>(Path.Combine(dataPath, "defects.json"));
            var maintenanceTasks = await LoadJsonAsync<MaintenanceTask[]>(Path.Combine(dataPath, "maintenance_tasks.json"));
            var blockRequests = await LoadJsonAsync<BlockRequest[]>(Path.Combine(dataPath, "block_requests.json"));
            var corridorWindows = await LoadJsonAsync<CorridorWindow[]>(Path.Combine(dataPath, "corridor_windows.json"));
            var trainSchedules = await LoadJsonAsync<TrainSchedule[]>(Path.Combine(dataPath, "train_schedule.json"));

            DataStore.TrackSections = trackSections ?? Array.Empty<TrackSection>();
            DataStore.Defects = defects ?? Array.Empty<Defect>();
            DataStore.MaintenanceTasks = maintenanceTasks ?? Array.Empty<MaintenanceTask>();
            DataStore.BlockRequests = blockRequests ?? Array.Empty<BlockRequest>();
            DataStore.CorridorWindows = corridorWindows ?? Array.Empty<CorridorWindow>();
            DataStore.TrainSchedules = trainSchedules ?? Array.Empty<TrainSchedule>();

            _logger.LogInformation("Data seeding completed successfully!");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error during data seeding");
            throw;
        }
    }

    private async Task<T?> LoadJsonAsync<T>(string filePath)
    {
        if (!File.Exists(filePath)) return default;
        var json = await File.ReadAllTextAsync(filePath);
        return JsonSerializer.Deserialize<T>(json, new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
    }
}

public static class DataStore
{
    public static TrackSection[] TrackSections { get; set; } = Array.Empty<TrackSection>();
    public static Defect[] Defects { get; set; } = Array.Empty<Defect>();
    public static MaintenanceTask[] MaintenanceTasks { get; set; } = Array.Empty<MaintenanceTask>();
    public static BlockRequest[] BlockRequests { get; set; } = Array.Empty<BlockRequest>();
    public static CorridorWindow[] CorridorWindows { get; set; } = Array.Empty<CorridorWindow>();
    public static TrainSchedule[] TrainSchedules { get; set; } = Array.Empty<TrainSchedule>();
    public static object? LastOptimizedSchedule { get; set; }
}
