using Microsoft.AspNetCore.Mvc;
using RailBlockAI.Api.Models;
using RailBlockAI.Api.Services;

namespace RailBlockAI.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class RailwayDataController : ControllerBase
{
    [HttpGet("track-sections")]
    public ActionResult<IEnumerable<TrackSection>> GetTrackSections() 
        => Ok(DataStore.TrackSections);

    [HttpGet("defects")]
    public ActionResult<IEnumerable<Defect>> GetDefects() 
        => Ok(DataStore.Defects);

    [HttpGet("maintenance-tasks")]
    public ActionResult<IEnumerable<MaintenanceTask>> GetMaintenanceTasks() 
        => Ok(DataStore.MaintenanceTasks);

    [HttpGet("block-requests")]
    public ActionResult<IEnumerable<BlockRequest>> GetBlockRequests() 
        => Ok(DataStore.BlockRequests);

    [HttpGet("corridor-windows")]
    public ActionResult<IEnumerable<CorridorWindow>> GetCorridorWindows() 
        => Ok(DataStore.CorridorWindows);

    [HttpGet("train-schedules")]
    public ActionResult<IEnumerable<TrainSchedule>> GetTrainSchedules() 
        => Ok(DataStore.TrainSchedules);
}
