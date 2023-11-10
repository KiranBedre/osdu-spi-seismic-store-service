namespace Sidecar.Common.Interface;

public interface IOptionsStorageQueue
{
    public string StorageQueueEndpoint { get; set; }
    public string StorageQueueTaskQueueName { get; set; }
}
