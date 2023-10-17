namespace Sidecar.Common.TaskQueue;

using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Sidecar.Common.Interface;

/// <summary>
/// Background service that works on the given task queue until cancellation.
/// </summary>
public class TaskQueueBackgroundService<TW> : BackgroundService
    where TW: ITaskQueueWorker
{
    private readonly ILogger<TaskQueueBackgroundService<TW>> _logger;
    private readonly TW _worker;
    private readonly TimeSpan _pauseBetweenTasks = TimeSpan.FromSeconds(5);

    public TaskQueueBackgroundService(ILogger<TaskQueueBackgroundService<TW>> logger, TW worker)
    {
        _logger = logger;
        _worker = worker;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await _worker.HandleNextTaskAsync(stoppingToken);
            }
            catch (Exception e) when (e is not OperationCanceledException)
            {
                _logger.LogError(e, "Error when handling a task. Continue...");
            }
            await Task.Delay(_pauseBetweenTasks, stoppingToken);
        }
    }
}
