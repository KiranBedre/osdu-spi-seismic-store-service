namespace Sidecar.Common.Config;

public class StorageQueueWorkerOptions
{
    /// <summary>
    /// Visibility timeout to set on the message (and to renew for)
    /// </summary>
    public TimeSpan LockDuration { get; init; }

    /// <summary>
    /// How often to renew the visibility timeout on the message
    /// </summary>
    public TimeSpan LockRenewalPeriod { get; init; }

    /// <summary>
    /// Messages that were failed to be executed MaxDequeueCount times will be discarded from the queue.
    /// </summary>
    public int MaxDequeueCount { get; init; }
}
