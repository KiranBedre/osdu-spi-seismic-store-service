namespace Sidecar.Common.Config;

using Azure.Storage.Queues;

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
    /// Messages that failed more than MaxDequeueCount times are moved to the poison queue.
    /// </summary>
    public int MaxDequeueCount { get; init; }

    /// <summary>
    /// Queue that preserves messages which exceeded MaxDequeueCount for manual recovery.
    /// </summary>
    public QueueClient? PoisonQueueClient { get; init; }
}
