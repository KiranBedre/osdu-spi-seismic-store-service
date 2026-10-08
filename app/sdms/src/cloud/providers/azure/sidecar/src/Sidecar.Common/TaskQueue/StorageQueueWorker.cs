namespace Sidecar.Common.TaskQueue;

using Azure.Storage.Queues;
using Azure.Storage.Queues.Models;
using Microsoft.Extensions.Logging;
using Sidecar.Common.Config;
using Sidecar.Common.Interface;
using Sidecar.Common.Model;

/// <summary>
/// Worker for Azure Storage Queue.
/// </summary>
public class StorageQueueWorker<T, TD, TE>(
    ILogger<StorageQueueWorker<T, TD, TE>> logger,
    QueueClient queueClient,
    TD taskDeserializer,
    TE executor,
    StorageQueueWorkerOptions opts) : ITaskQueueWorker
    where TD : ITaskDeserializer<string, T>
    where TE : ITaskExecutor<T>
{
    private readonly ITaskExecutor<T> _executor = executor;
    private readonly ILogger<StorageQueueWorker<T, TD, TE>> _logger = logger;
    private readonly QueueClient _queueClient = queueClient;
    private readonly TD _taskDeserializer = taskDeserializer;
    private readonly int _maxDequeueCount = opts.MaxDequeueCount;
    private readonly TimeSpan _lockDuration = opts.LockDuration;  // should be greater than _lockRenewalPeriod
    private readonly TimeSpan _lockRenewalPeriod = opts.LockRenewalPeriod;  // should be less than _lockDuration

    public async Task<ExecutionStatus> HandleNextTaskAsync(CancellationToken ct)
    {
        var message = await TryGetTaskAsync(ct);
        if (message is null)
        {
            return ExecutionStatus.TaskNotFound;
        }

        // task should be stopped if the lock is lost or the cancellation is requested
        var taskExecutionCtSource = CancellationTokenSource.CreateLinkedTokenSource(ct);
        var messagePayload = message.MessageText;
        var taskExecution = Task.Run(
            async () =>
            {
                var task = _taskDeserializer.Deserialize(messagePayload);
                await _executor.ProcessAsync(task, taskExecutionCtSource.Token);
            }, taskExecutionCtSource.Token);

        while (true)
        {
            // wait for either the task execution to be complete, or for the time to update the message lock
            _ = await Task.WhenAny(
            [
                taskExecution,
                Task.Delay(
                    _lockRenewalPeriod,
                    CancellationToken.None  // we want taskExecution to react to the cancellation token
                    ),
            ]);

            if (taskExecution.IsCompleted)
            {
                try
                {
                    await taskExecution;
                }
                catch (OperationCanceledException e)
                {
                    // If the task was cancelled, it's safe to not reset its visibility explicitly and just exit.
                    // The task will be returned to the queue automatically when its current visibility timeout expires.
                    _logger.LogInformation(e, "Task for message {MessageId} was cancelled", message.MessageId);
                    throw;
                }
                catch (Exception e)
                {
                    _logger.LogError(e, "Exception processing the message {MessageId}. Returning it to the queue", message.MessageId);
                    _ = await UpdateVisibilityAsync(message, TimeSpan.Zero, ct);
                    throw;
                }
                break;
            }

            // update message visibility timeout (i.e. lock)
            try
            {
                message = await UpdateVisibilityAsync(message, _lockDuration, ct);
                _logger.LogInformation(
                    "Re-acquired the lock for message {MessageId}. New visibility timeout is {VisibilityTimeout}",
                    message.MessageId, message.NextVisibleOn);
            }
            catch (Exception e)
            {
                // If we failed to update message visibility, we very likely don't have the message's fresh popReceipt.
                // Without the actual popReceipt, further attempts to update visibility or to delete the message
                // from the queue will fail.
                //
                // Now the best we can do is gracefully wrap-up the task execution: cancel it, wait for it to complete
                // to avoid having a "loose" background thread (see Structured Concurrency), and exit the method.
                _logger.LogError(e, "Could not re-acquire the lock for message {MessageId}. Trying to cancel task execution", message.MessageId);
                taskExecutionCtSource.Cancel();
                try
                {
                    // make sure we don't leave a running thread behind
                    await taskExecution;
                    _logger.LogWarning(
                        "The task for message {MessageId} could not be cancelled and has run to completion. " +
                        "But because the lock was lost, we can not delete the message from the queue",
                        message.MessageId);
                }
                catch (OperationCanceledException innerEx)
                {
                    _logger.LogInformation(
                        innerEx, "The task for message {MessageId} was successfully cancelled", message.MessageId);
                }
                throw;
            }
        }

        _logger.LogInformation("Completed task for the message {MessageId}. Deleting it from the queue", message.MessageId);
        await DeleteFromQueueAsync(message, ct);
        return ExecutionStatus.TaskCompleted;
    }

    /// <returns>QueueMessage, or null if no messages are available in the queue</returns>
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

            _logger.LogInformation("Received message {MessageId}", message.MessageId);
            if (message.DequeueCount > _maxDequeueCount)
            {
                _logger.LogInformation(
                    "Deleting message {MessageId}, dequeue count {DequeueCount} is too high",
                    message.MessageId, message.DequeueCount);
                await DeleteFromQueueAsync(message, ct);
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
    private async Task<QueueMessage> UpdateVisibilityAsync(QueueMessage message, TimeSpan visibilityTimeout, CancellationToken ct)
    {
        var updateReceipt = await _queueClient.UpdateMessageAsync(
            messageId: message.MessageId,
            popReceipt: message.PopReceipt,
            visibilityTimeout: visibilityTimeout,
            cancellationToken: ct);
        if (!updateReceipt.HasValue || updateReceipt.Value is null)
        {
            throw new("Unexpected error: could not update message visibility");
        }
        return message.Update(updateReceipt.Value);
    }

    private Task DeleteFromQueueAsync(QueueMessage message, CancellationToken ct) => _queueClient.DeleteMessageAsync(
            messageId: message.MessageId,
            popReceipt: message.PopReceipt,
            cancellationToken: ct);
}
