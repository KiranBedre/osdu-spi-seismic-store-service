namespace Sidecar.Common.TaskQueue;

using Azure;
using Azure.Storage.Queues;
using Azure.Storage.Queues.Models;
using Microsoft.Extensions.Logging;

public class StorageQueueLockRenewer
{
    private readonly QueueClient _queueClient;
    private readonly ILogger<StorageQueueLockRenewer> _logger;
    private readonly TimeSpan _lockDuration = TimeSpan.FromMinutes(5);
    private readonly TimeSpan _lockUpdateFrequency = TimeSpan.FromMinutes(3);

    public StorageQueueLockRenewer(QueueClient queueClient, ILogger<StorageQueueLockRenewer> logger)
    {
        _queueClient = queueClient;
        _logger = logger;
    }

    public async Task AutoRenew(QueueMessage msg, Action lockLostCallback, CancellationToken ct)
    {
        try
        {
            while (!ct.IsCancellationRequested)
            {
                Response<UpdateReceipt>? response;
                try
                {
                    response = await _queueClient.UpdateMessageAsync(
                        messageId: msg.MessageId,
                        popReceipt: msg.PopReceipt,
                        visibilityTimeout: _lockDuration,
                        cancellationToken: ct);
                }
                catch (Exception e) when (e is not OperationCanceledException)
                {
                    _logger.LogError(e, "Got error for message {MsgId}. Considering the lock lost", msg.MessageId);
                    lockLostCallback();
                    throw;
                }

                if (!response.HasValue)
                {
                    var status = response.GetRawResponse().Status;
                    _logger.LogInformation(
                        "Got response for msg {MsgId} with status {Status}. Considering the lock lost",
                        msg.MessageId, status);
                    lockLostCallback();
                    return;
                }

                await Task.Delay(_lockUpdateFrequency, ct);
            }
        }
        catch (OperationCanceledException)
        {
            // do nothing, exit gracefully if cancellation is requested
        }
    }
}
