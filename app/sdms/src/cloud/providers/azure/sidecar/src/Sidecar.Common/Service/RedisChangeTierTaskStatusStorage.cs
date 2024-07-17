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

public class RedisChangeTierTaskStatusStorage : IChangeTierTaskStatusStorage
{
    private readonly TimeSpan _changetierStatusExpirySeconds = TimeSpan.FromDays(90);

    private readonly IOptionsQueueNameRedis _options;
    private readonly IRedisHandler _queue;

    public RedisChangeTierTaskStatusStorage(
        IOptionsQueueNameRedis options,
        IRedisConnectionFactory<RedisQueueConnectionFactory> redisConnectionFactory)
    {
        _options = options;
        _queue = redisConnectionFactory.GetRedis();
    }

    public async Task<ChangeTierOperationStatus> CreateChangeTierOperationStatusAsync(IChangeTierOperationMessage opMsg, CancellationToken ct = default)
    {
        var db = _queue.GetDatabase();
        var status = new ChangeTierOperationStatus
        {
            OperationId = opMsg.OperationId,
            Tenant = opMsg.Tenant,
            Subproject = opMsg.Subproject,
            Query = opMsg.Query,
            Parameters = opMsg.Parameters,
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

        var statusKey = _options.StatusRedisQueueName + ":status:" + status.OperationId.ToLower();

        await db.HashSetAsync(statusKey, statusHash);
        _ = await db.KeyExpireAsync(statusKey, _changetierStatusExpirySeconds);

        return status;
    }

    public async Task IncrementCountAsync(string operationId, string field, CancellationToken ct = default)
    {
        var statusKey = $"{_options.StatusRedisQueueName}:status:{operationId.ToLower()}";
        _ = await _queue.HashIncrementAsync(statusKey, field);
        _ = await _queue.HashSetAsync(statusKey, Constants.ChangeTierOperationStatus.LAST_UPDATED_AT, DateTime.UtcNow.ToString("M/d/yyyy h:mm:ss tt"));
    }

    public async Task UpdateFieldStatusOperationAsync(string operationId, string keyName, string keyValue, CancellationToken ct = default)
    {
        var statusKey = $"{_options.StatusRedisQueueName}:status:{operationId.ToLower()}";
        _ = await _queue.HashSetAsync(statusKey, keyName, keyValue);
        _ = await _queue.HashSetAsync(statusKey, Constants.ChangeTierOperationStatus.LAST_UPDATED_AT, DateTime.UtcNow.ToString("M/d/yyyy h:mm:ss tt"));
    }
}
