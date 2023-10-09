namespace Sidecar.Common.TaskQueue;

using Azure.Storage.Queues;
using Azure.Storage.Queues.Models;
using Microsoft.Extensions.Logging;
using Sidecar.Common.Interface;

public class StorageQueueTaskQueueFramework: ITaskQueueFramework
{
    private readonly ITaskExecutor<string> _executor;
    private readonly ILogger<StorageQueueTaskQueueFramework> _logger;
    private readonly QueueClient _queueClient;
    private readonly StorageQueueLockRenewer _lockAutoRenewer;
    private readonly int _maxDequeueCount;

    public StorageQueueTaskQueueFramework(
        ILogger<StorageQueueTaskQueueFramework> logger,
        QueueClient queueClient,
        StorageQueueLockRenewer lockAutoRenewer,
        ITaskExecutor<string> executor,
        int maxDequeueCount = 5)
    {
        _logger = logger;
        _queueClient = queueClient;
        _lockAutoRenewer = lockAutoRenewer;
        _executor = executor;
        _maxDequeueCount = maxDequeueCount;
    }

    public async Task HandleNextTask(CancellationToken ct)
    {
        await _queueClient.CreateIfNotExistsAsync(cancellationToken: ct);

        var message = await TryGetTaskAsync(ct);
        if (message is null)
        {
            return;
        }
        
        var taskExecutionCtSource = CancellationTokenSource.CreateLinkedTokenSource(ct);
        var bgThreadCtSource = CancellationTokenSource.CreateLinkedTokenSource(ct);
        var bgThread = _lockAutoRenewer.AutoRenew(
            message,
            lockLostCallback: taskExecutionCtSource.Cancel,
            bgThreadCtSource.Token);

        try
        {
            try
            {
                await _executor.Process(message.MessageText, taskExecutionCtSource.Token);
            }
            finally
            {
                bgThreadCtSource.Cancel();
                await bgThread;
            }
            await RemoveFromQueue(message, ct);
        }
        catch (Exception)
        {
            await TryReleaseLock(message, ct);
        }
    }
    
    private async Task<QueueMessage?> TryGetTaskAsync(CancellationToken ct)
    {
        while (true)
        {
            _logger.LogInformation("Receiving message...");
            var response = await _queueClient.ReceiveMessageAsync(
                visibilityTimeout: TimeSpan.FromMinutes(5),
                cancellationToken: ct);
        
            if (!response.HasValue)
            {
                _logger.LogInformation("Got no response from Azure Queue...");
                return null;
            }

            var message = response.Value;

            _logger.LogInformation("Received message {}", message.MessageId);
            if (message.DequeueCount > _maxDequeueCount)
            {
                _logger.LogInformation("Deleting message {}, dequeue count too high...", message.MessageId);
                await _queueClient.DeleteMessageAsync(
                    messageId: message.MessageId,
                    popReceipt: message.PopReceipt,
                    cancellationToken: ct);
                continue;
            }

            return message;
        }
    }
    
    private Task RemoveFromQueue(QueueMessage message, CancellationToken ct)
    {
        
        _logger.LogInformation("Deleting message {}, dequeue count too high...", message.MessageId);
        return _queueClient.DeleteMessageAsync(
            messageId: message.MessageId,
            popReceipt: message.PopReceipt,
            cancellationToken: ct);
    }
    
    
    private async Task TryReleaseLock(QueueMessage message, CancellationToken ct)
    {
        _logger.LogInformation("Returning message {} back to the queue", message.MessageId);
        try
        {
            await _queueClient.UpdateMessageAsync(
                messageId: message.MessageId,
                popReceipt: message.PopReceipt,
                visibilityTimeout: TimeSpan.Zero,
                cancellationToken: ct);
        }
        catch (Exception e)
        {
            _logger.LogWarning(
                e,
                "Could not reset visibility of message {} to zero. Perhaps the message was already taken from the queue",
                message.MessageId);
        }
    }
}
