namespace Sidecar.Common.Interface;

using Sidecar.Common.Model;

/// <summary>
/// Task queue worker that knows how to take and handle the task from the queue.
/// </summary>
public interface ITaskQueueWorker
{
    public Task<ExecutionStatus> HandleNextTaskAsync(CancellationToken ct);
}
