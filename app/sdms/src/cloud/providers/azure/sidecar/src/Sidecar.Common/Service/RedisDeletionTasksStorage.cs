// ============================================================================
// Copyright 2017-2023, Microsoft
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
// ============================================================================

namespace Sidecar.Common.Service;

using Microsoft.Extensions.Logging;
using StackExchange.Redis;
using System.Threading.Tasks;

using Interface;
using Model;
using Sidecar.Common.Utility;

public class RedisDeletionTasksStorage : IDeletionTasksStorage
{
    private readonly ILogger<RedisDeletionTasksStorage> _logger;
    private readonly IOptionsQueueRedisQueueName _options;
    private readonly IRedisHandler _queue;

    public RedisDeletionTasksStorage(
        ILogger<RedisDeletionTasksStorage> logger,
        IOptionsQueueRedisQueueName options,
        IRedisConnectionFactory redisConnectionFactory)
    {
        _logger = logger;
        _options = options;
        _queue = redisConnectionFactory.GetRedisForQueue();
    }

    public async Task<IDeleteOperationStatus?> CheckForDeletionOperationAsync()
    {
        var db = _queue.GetDatabase();

        var opMsg = await GetDeletionOperationMessageAsync(db);
        if (opMsg == null)
        {
            return null;
        }

        var statusMsg = await CreateDeletionOperationStatusAsync(db, opMsg);

        return statusMsg;

    }

    private async Task<DeleteOperationMessage?> GetDeletionOperationMessageAsync(IDatabase db)
    {
        var delQ = _options.QueueName;

        var op = await db.ListLeftPopAsync(delQ);

        if (!op.HasValue)
        {
            _logger.LogDebug("Deletion queue {q} is empty", delQ);
            Thread.Sleep(1000);
            return null;
        }

        var opDataKey = _options.QueueName + ":" + op.ToString();
        var delOpData = await db.HashGetAllAsync(opDataKey);

        if (delOpData.Length == 0)
        {
            _logger.LogError("Failed to get operation data from queue for operation id {q}", opDataKey);
            throw new RedisException("Failed to get operation data from queue");
        }
        return delOpData.FromHashEntries<DeleteOperationMessage>(true);
    }

    private async Task<DeleteOperationStatus> CreateDeletionOperationStatusAsync(IDatabase db, DeleteOperationMessage opMsg)
    {

        var status = new DeleteOperationStatus
        {
            OperationId = opMsg.OperationId,
            Tenant = opMsg.Tenant,
            Subproject = opMsg.Subproject,
            Path = opMsg.Path,
            CreatedAt = DateTime.UtcNow,
            LastUpdatedAt = DateTime.UtcNow,
            CreatedBy = "Sidecar.QueueHandlerRedis",
            Status = Status.Started.ToString(),
            StatusDescription = Status.Started.Description(),
            DatasetsCnt = 0,
            DeletedCnt = 0,
            FailedCnt = 0
        };

        var statusHash = status.ToHashEntries();

        var statusKey = _options.QueueName + ":status:" + status.OperationId.ToLower();

        await db.HashSetAsync(statusKey, statusHash);

        return status!;
    }

    public async Task IncrementCountAsync(string operationId, string field)
    {
        var statusKey = $"{_options.QueueName}:status:{operationId.ToLower()}";
        _ = await _queue.HashIncrementAsync(statusKey, field);
        _ = await _queue.HashSetAsync(statusKey, Constants.DeleteOperationStatus.LAST_UPDATED_AT, DateTime.UtcNow.ToString("M/d/yyyy h:mm:ss tt"));
    }

    public async Task UpdateFieldStatusOperationAsync(string operationId, string keyName, string keyValue)
    {
        var statusKey = $"{_options.QueueName}:status:{operationId.ToLower()}";
        _ = await _queue.HashSetAsync(statusKey, keyName, keyValue);
        _ = await _queue.HashSetAsync(statusKey, Constants.DeleteOperationStatus.LAST_UPDATED_AT, DateTime.UtcNow.ToString("M/d/yyyy h:mm:ss tt"));
    }
}
