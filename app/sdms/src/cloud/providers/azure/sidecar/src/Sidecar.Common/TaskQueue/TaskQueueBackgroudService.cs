namespace Sidecar.Common.TaskQueue;

using Microsoft.Extensions.Hosting;
using Sidecar.Common.Interface;

/// <summary>
/// Background service that forever works on the given task queue.
/// </summary>
public class TaskQueueBackgroundService : BackgroundService
{
    private readonly ITaskQueueWorker _worker;
    private readonly TimeSpan _pauseBetweenTasks = TimeSpan.FromSeconds(5);

    public TaskQueueBackgroundService(ITaskQueueWorker worker)
    {
        _worker = worker;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            await _worker.HandleNextTask(stoppingToken);
            await Task.Delay(_pauseBetweenTasks, stoppingToken);
        }
    }
}
