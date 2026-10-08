namespace Sidecar.Common.Interface;

public interface IOptionsStorageQueue
{
    string StorageQueueEndpoint { get; set; }
    string TaskStorageQueueName { get; set; }
}
