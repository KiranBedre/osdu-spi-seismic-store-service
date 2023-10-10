namespace Sidecar.Common.TaskQueue;

using Azure.Storage.Queues;
using Azure.Storage.Queues.Models;
using Microsoft.Extensions.Logging;
using Sidecar.Common.Interface;

/// <summary>
/// Worker for Azure Storage Queue.
/// </summary>
public class StorageQueueWorker<T, TD, TE>: ITaskQueueWorker
    where TD: ITaskDeserializer<string, T>
    where TE: ITaskExecutor<T>
{
    private readonly ITaskExecutor<T> _executor;
    private readonly ILogger<StorageQueueWorker<T, TD, TE>> _logger;
    private readonly QueueClient _queueClient;
    private readonly TD _taskDeserializer;
    private readonly int _maxDequeueCount;
    private readonly TimeSpan _lockDuration = TimeSpan.FromMinutes(5);  // should be greater than _lockRenewalPeriod
    private readonly TimeSpan _lockRenewalPeriod = TimeSpan.FromMinutes(3);  // should be less than _lockDuration

    public StorageQueueWorker(
        ILogger<StorageQueueWorker<T, TD, TE>> logger,
        QueueClient queueClient,
        TD taskDeserializer,
        TE executor,
        int maxDequeueCount = 5)
    {
        _logger = logger;
        _queueClient = queueClient;
        _taskDeserializer = taskDeserializer;
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

        // task should be stopped if the lock is lost or the cancellation is requested
        var taskExecutionCtSource = CancellationTokenSource.CreateLinkedTokenSource(ct);
        var messagePayload = message.MessageText;
        var taskExecution = Task.Run(
            async () =>
            {
                var task = _taskDeserializer.Deserialize(messagePayload);
                await _executor.Process(task, taskExecutionCtSource.Token);
            }, taskExecutionCtSource.Token);
        
        while (true)
        {
            // wait for either the task execution to be complete, or for the time to update the message lock
            await Task.WhenAny(new[]
            {
                taskExecution,
                Task.Delay(_lockRenewalPeriod, ct),
            });

            if (taskExecution.IsCompleted)
            {
                try
                {
                    await taskExecution;
                }
                catch (Exception e)
                {
                    _logger.LogError(e, "Exception processing the message {}. Returning it to the queue", message.MessageId);
                    await UpdateVisibility(message, TimeSpan.Zero, ct);
                    throw;
                }
                break;
            }

            // update message lock
            try
            {
                message = await UpdateVisibility(message, _lockDuration, ct);
            }
            catch (Exception e)
            {
                _logger.LogError(e, "Lost the lock for message {}", message.MessageId);
                taskExecutionCtSource.Cancel();  // cancel task execution
                await taskExecution;  // wait for task execution to complete
                throw;
            }
        }
        
        _logger.LogInformation("Completed message {}", message.MessageId);
        await DeleteFromQueue(message, ct);
    }
    
    private async Task<QueueMessage?> TryGetTaskAsync(CancellationToken ct)
    {
        while (true)
        {
            _logger.LogInformation("Receiving message...");
            var response = await _queueClient.ReceiveMessageAsync(
                visibilityTimeout: _lockDuration,
                cancellationToken: ct);
        
            if (!response.HasValue || response.Value is null)
            {
                _logger.LogInformation("No message available on Azure Queue...");
                return null;
            }

            var message = response.Value;

            _logger.LogInformation("Received message {}", message.MessageId);
            if (message.DequeueCount > _maxDequeueCount)
            {
                _logger.LogInformation(
                    "Deleting message {}, dequeue count {} is too high",
                    message.MessageId, message.DequeueCount);
                await DeleteFromQueue(message, ct);
                continue;
            }

            return message;
        }
    }

    /// <summary>
    /// Update the lock duration (i.e. visibility timeout) on the message.
    /// </summary>
    /// <returns>QueueMessage with the actualized PopReceipt - it can be used for message updates/deletes.</returns>
    /// <exception cref="Exception">Unexpected exception</exception>
    private async Task<QueueMessage> UpdateVisibility(QueueMessage message, TimeSpan visibilityTimeout, CancellationToken ct)
    {
        var updateReceipt = await _queueClient.UpdateMessageAsync(
            messageId: message.MessageId,
            popReceipt: message.PopReceipt,
            visibilityTimeout: visibilityTimeout,
            cancellationToken: ct);
        if (!updateReceipt.HasValue || updateReceipt.Value is null)
        {
            throw new Exception("Unexpected error: could not update message visibility");
        }
        return message.Update(updateReceipt.Value);
    }
    
    private Task DeleteFromQueue(QueueMessage message, CancellationToken ct)
    {
        return _queueClient.DeleteMessageAsync(
            messageId: message.MessageId,
            popReceipt: message.PopReceipt,
            cancellationToken: ct);
    }
}
