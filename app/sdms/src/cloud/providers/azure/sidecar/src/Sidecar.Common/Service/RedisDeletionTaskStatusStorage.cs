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

using System.Threading.Tasks;

using Interface;
using Model;
using Sidecar.Common.Utility;

public class RedisDeletionTaskStatusStorage : IDeletionTaskStatusStorage
{
    private readonly TimeSpan _deletionStatusExpirySeconds = TimeSpan.FromDays(90);

    private readonly IOptionsQueueRedisQueueName _options;
    private readonly IRedisHandler _queue;

    public RedisDeletionTaskStatusStorage(
        IOptionsQueueRedisQueueName options,
        IRedisConnectionFactory redisConnectionFactory)
    {
        _options = options;
        _queue = redisConnectionFactory.GetRedisForQueue();
    }

    public async Task<DeleteOperationStatus> CreateDeletionOperationStatusAsync(IDeletionOperationMessage opMsg, CancellationToken ct = default)
    {
        var db = _queue.GetDatabase();
        var status = new DeleteOperationStatus
        {
            OperationId = opMsg.OperationId,
            Tenant = opMsg.Tenant,
            Subproject = opMsg.Subproject,
            Query = opMsg.Query,
            CreatedAt = DateTime.UtcNow,
            LastUpdatedAt = DateTime.UtcNow,
            CreatedBy = opMsg.CreatedBy,
            Status = Status.Started.ToString(),
            StatusDescription = Status.Started.Description(),
            DatasetsCnt = 0,
            CompletedCnt = 0,
            FailedCnt = 0,
        };

        var statusHash = status.ToHashEntries();

        var statusKey = _options.QueueName + ":status:" + status.OperationId.ToLower();

        await db.HashSetAsync(statusKey, statusHash);
        _ = await db.KeyExpireAsync(statusKey, _deletionStatusExpirySeconds);

        return status;
    }

    public async Task IncrementCountAsync(string operationId, string field, CancellationToken ct = default)
    {
        var statusKey = $"{_options.QueueName}:status:{operationId.ToLower()}";
        _ = await _queue.HashIncrementAsync(statusKey, field);
        _ = await _queue.HashSetAsync(statusKey, Constants.DeleteOperationStatus.LAST_UPDATED_AT, DateTime.UtcNow.ToString("M/d/yyyy h:mm:ss tt"));
    }

    public async Task UpdateFieldStatusOperationAsync(string operationId, string keyName, string keyValue, CancellationToken ct = default)
    {
        var statusKey = $"{_options.QueueName}:status:{operationId.ToLower()}";
        _ = await _queue.HashSetAsync(statusKey, keyName, keyValue);
        _ = await _queue.HashSetAsync(statusKey, Constants.DeleteOperationStatus.LAST_UPDATED_AT, DateTime.UtcNow.ToString("M/d/yyyy h:mm:ss tt"));
    }
}
