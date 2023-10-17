namespace Sidecar.Common.TaskQueue;

using Microsoft.Extensions.Logging;
using Sidecar.Common.Interface;
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

    public async Task HandleNextTaskAsync(CancellationToken ct)
    {
        var db = _queue.GetDatabase();

        var queueName = _options.QueueName;

        var operationId = await db.ListLeftPopAsync(queueName);

        if (!operationId.HasValue)
        {
            _logger.LogInformation("No tasks found in the queue {Queue}", queueName);
            return;
        }

        var operationDataKey = $"{queueName}:{operationId}";
        var operationData = await db.HashGetAllAsync(operationDataKey);

        if (operationData.Length == 0)
        {
            _logger.LogError(
                "Failed to get operation data from queue for operation id {OperationDataKey}",
                operationDataKey);
            throw new("Failed to get operation data from queue");
        }

        // If deserialization fails, consider the operation poison message,
        // and do not return it back to the queue
        var task = _deserializer.Deserialize(operationData);

        try
        {
            await _executor.Process(task, ct);
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

        // successfully processed task.
        // deleting the operation data from the queue.
        _ = await db.KeyDeleteAsync(operationDataKey);
    }
}
