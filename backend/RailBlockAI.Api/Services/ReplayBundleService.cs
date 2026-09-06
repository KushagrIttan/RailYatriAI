using System.Text.Json;

namespace RailBlockAI.Api.Services;

public interface IReplayBundleService
{
    Task<JsonDocument> LoadAsync(CancellationToken cancellationToken = default);
}

/// <summary>
/// Loads the checked-in, frozen replay bundle. The application deliberately does
/// not fetch operational data at runtime: every demo run uses the same captured
/// timetable snapshot and procedure-driven maintenance cases.
/// </summary>
public sealed class ReplayBundleService : IReplayBundleService
{
    private readonly IWebHostEnvironment _environment;

    public ReplayBundleService(IWebHostEnvironment environment)
    {
        _environment = environment;
    }

    public async Task<JsonDocument> LoadAsync(CancellationToken cancellationToken = default)
    {
        var bundlePath = Path.GetFullPath(Path.Combine(
            _environment.ContentRootPath, "..", "..", "data", "replay", "dli-gzb", "replay_bundle.json"));

        if (!File.Exists(bundlePath))
        {
            throw new FileNotFoundException("Replay bundle was not found.", bundlePath);
        }

        await using var stream = File.OpenRead(bundlePath);
        return await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);
    }
}
