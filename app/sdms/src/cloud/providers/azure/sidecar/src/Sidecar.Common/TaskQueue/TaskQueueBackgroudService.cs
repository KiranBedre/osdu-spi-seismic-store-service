namespace Sidecar.Common.TaskQueue;

using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Sidecar.Common.Interface;

/// <summary>
/// Background service that forever works on the given task queue.
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
                await _worker.HandleNextTask(stoppingToken);
            }
            catch (Exception e)
            {
                _logger.LogError(e, "Got an error when trying to handle a task");
            }
            await Task.Delay(_pauseBetweenTasks, stoppingToken);
        }
    }
}
