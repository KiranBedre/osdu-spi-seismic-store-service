namespace Sidecar.Common.TaskQueue;

using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Sidecar.Common.Config;
using Sidecar.Common.Interface;
using Sidecar.Common.Model;

/// <summary>
/// Background service that works on the given task queue until cancellation.
/// </summary>
public class TaskQueueBackgroundService<TW> : BackgroundService
    where TW : ITaskQueueWorker
{
    private readonly ILogger<TaskQueueBackgroundService<TW>> _logger;
    private readonly TW _worker;
    private readonly TaskQueueBackgroundServiceOptions _opts;

    public TaskQueueBackgroundService(
        ILogger<TaskQueueBackgroundService<TW>> logger,
        TW worker,
        TaskQueueBackgroundServiceOptions opts)
    {
        _logger = logger;
        _worker = worker;
        _opts = opts;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (true)
        {
            stoppingToken.ThrowIfCancellationRequested();
            try
            {
                var status = await _worker.HandleNextTaskAsync(stoppingToken);
                if (status is ExecutionStatus.TaskNotFound)
                {
                    _logger.LogInformation(
                        "There are no tasks. Will retry after {Timeout}", _opts.DelayWhenTaskNotFound);
                    await Task.Delay(_opts.DelayWhenTaskNotFound, stoppingToken);
                }
            }
            catch (Exception e) when (e is not OperationCanceledException)
            {
                _logger.LogError(e, "Error when handling a task. Continue...");
            }
        }
    }
}
