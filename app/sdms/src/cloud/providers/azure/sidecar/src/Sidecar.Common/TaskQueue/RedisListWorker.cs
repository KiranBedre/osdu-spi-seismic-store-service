namespace Sidecar.Common.TaskQueue;

using Microsoft.Extensions.Logging;
using Sidecar.Common.Interface;
using Sidecar.Common.Model;
using StackExchange.Redis;

/// <summary>
/// Worker that consumes tasks from Redis list.
///
/// Task queue architecture:
/// - list by the key "{queue_name}" that contains operation_id for each task to execute
/// - for each operation_id, a redis hash by the key "{queue_name}:{operation_id}" containing detailed operation data.
/// </summary>
public class RedisListWorker<T, TD, TE> : ITaskQueueWorker
    where TD : ITaskDeserializer<HashEntry[], T>
    where TE : ITaskExecutor<T>
{
    private readonly ILogger<RedisListWorker<T, TD, TE>> _logger;
    private readonly TD _deserializer;

    private readonly IOptionsQueueRedisQueueName _options;
    private readonly IRedisHandler _queue;
    private readonly TE _executor;

    public RedisListWorker(
        ILogger<RedisListWorker<T, TD, TE>> logger,
        TD deserializer,
        TE executor,
        IRedisConnectionFactory redisConnectionFactory,
        IOptionsQueueRedisQueueName options)
    {
        _logger = logger;
        _executor = executor;
        _queue = redisConnectionFactory.GetRedisForQueue();
        _options = options;
        _deserializer = deserializer;
    }

    public async Task<ExecutionStatus> HandleNextTaskAsync(CancellationToken ct)
    {
        var db = _queue.GetDatabase();

        var queueName = _options.QueueName;

        var operationId = await db.ListLeftPopAsync(queueName);

        if (!operationId.HasValue)
        {
            _logger.LogInformation("No tasks found in the queue {Queue}", queueName);
            return ExecutionStatus.TaskNotFound;
        }

        var operationDataKey = $"{queueName}:{operationId}";
        var operationData = await db.HashGetAllAsync(operationDataKey);

        if (operationData.Length == 0)
        {
            // poison message, do not return it back to the queue
            _logger.LogError(
                "Failed to get operation data from queue for operation id {OperationDataKey}",
                operationDataKey);
            throw new("Failed to get operation data from the queue");
        }

        T task;
        try
        {
            task = _deserializer.Deserialize(operationData);
        }
        catch (Exception e)
        {
            // poison message, do not return it back to the queue
            _logger.LogError(e, "Failed to deserialize {OperationId}. Removing it from Redis", operationId);
            _ = await db.KeyDeleteAsync(operationDataKey);
            throw;
        }

        try
        {
            await _executor.ProcessAsync(task, ct);
        }
        catch (Exception e) when (e is not OperationCanceledException)
        {
            // Simplicity tradeoffs:
            // - it is possible that we fail to return the task to the queue, and it will be lost forever.
            // - we don't limit the retry count, a "poison message" will be repeatedly re-consumed forever.
            _logger.LogError(e, "Failed to process operation {OperationId}. Returning it to the queue", operationId);
            _ = await db.ListRightPushAsync(queueName, operationId);
            throw;
        }

        // successfully processed task. delete its data.
        _ = await db.KeyDeleteAsync(operationDataKey);

        return ExecutionStatus.TaskCompleted;
    }
}
