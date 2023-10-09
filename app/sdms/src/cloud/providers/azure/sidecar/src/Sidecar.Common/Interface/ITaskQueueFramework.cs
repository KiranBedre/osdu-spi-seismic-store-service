namespace Sidecar.Common.Interface;

public interface ITaskQueueFramework
{
    public Task HandleNextTask(CancellationToken ct);
}
