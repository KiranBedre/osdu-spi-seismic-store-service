namespace Sidecar.Common.TaskQueue;

using Microsoft.Extensions.Hosting;
using Sidecar.Common.Interface;

public class TaskQueueBackgroundService : BackgroundService
{
    private readonly ITaskQueueFramework _framework;

    public TaskQueueBackgroundService(ITaskQueueFramework framework)
    {
        _framework = framework;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            await _framework.HandleNextTask(stoppingToken);
        }
    }
}
