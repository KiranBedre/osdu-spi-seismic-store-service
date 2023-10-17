namespace Sidecar.Common.Interface;

/// <summary>
/// Task queue worker that knows how to take and handle the task from the queue.
/// </summary>
public interface ITaskQueueWorker
{
    public Task HandleNextTaskAsync(CancellationToken ct);
}
