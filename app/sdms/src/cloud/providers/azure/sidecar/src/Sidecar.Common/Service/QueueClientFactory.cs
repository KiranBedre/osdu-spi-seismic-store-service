namespace Sidecar.Common.Service;

using Azure.Core;
using Azure.Storage.Queues;
using Sidecar.Common.Interface;

public class QueueClientFactory(IOptionsStorageQueue opts, TokenCredential credential)
{
    private readonly IOptionsStorageQueue _opts = opts;
    private readonly TokenCredential _credential = credential;

    public QueueClient Build(string? queueName = null)
    {
        var queueUri = new QueueUriBuilder(new(_opts.StorageQueueEndpoint))
        {
            QueueName = queueName ?? _opts.TaskStorageQueueName,
        }.ToUri();

        var queueClientOptions = new QueueClientOptions
        {
            MessageEncoding = QueueMessageEncoding.Base64,
        };

        var queueClient = new QueueClient(queueUri, _credential, queueClientOptions);
        _ = queueClient.CreateIfNotExists();  // creates the storage queue if it does not exist

        return queueClient;
    }
}
