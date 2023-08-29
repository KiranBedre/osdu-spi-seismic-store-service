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

public class RedisHandlerDeletion : RedisHandler, IQueueHandlerDeletion
{
    readonly IOptionsQueueRedisQueueName _options;

    public RedisHandlerDeletion(
        ILogger<RedisHandlerDeletion> logger, 
        IOptionsQueueRedisQueueName options, 
        IRedisConnectionFactory redisConnectionFactory)
        : base(logger, redisConnectionFactory.GetRedisForQueue())
    {
        _options = options;
    }

    public async Task<IDeleteOperationStatus?> CheckForDeletionOperationAsync()
    {
        var db = GetDatabase();

        var opMsg = await GetDeletionOperationMessage(db);
        if(opMsg == null){
            return null;
        }

        var statusMsg = await CreateDeletionOperationStatus(db,opMsg);

        return statusMsg;

    }

    private async Task<DeleteOperationMessage?> GetDeletionOperationMessage(IDatabase db){
        var delQ = _options.QueueName;
        if (!await db.KeyExistsAsync(delQ))
        {
            Logger.LogError("Queue {q} does not exist", delQ);
            throw new RedisException("Queue does not exist");
        }

        var op = await db.ListLeftPopAsync(delQ);

        if (!op.HasValue)
        {
            Logger.LogDebug("Deletion queue {q} is empty", delQ);
            return null;
        }

        var opDataKey = _options.QueueName + ":" + op.ToString();
        var delOpData = await db.HashGetAllAsync(opDataKey);

        if (delOpData.Length == 0)
        {
            Logger.LogError("Failed to get operation data from queue for operation id {q}", opDataKey);
            throw new RedisException("Failed to get operation data from queue");
        }
        return delOpData.FromHashEntries<DeleteOperationMessage>(true);
    }

    private async Task<DeleteOperationStatus> CreateDeletionOperationStatus(IDatabase db, DeleteOperationMessage opMsg){

        var status = new DeleteOperationStatus
        {
            OperationId = opMsg.OperationId,
            Tenant = opMsg.Tenant,
            Subproject = opMsg.Subproject,
            Path = opMsg.Path,
            CreatedAt = DateTime.UtcNow,
            LastUpdatedAt = DateTime.UtcNow,
            CreatedBy = "Sidecar.QueueHanderRedis",
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
        await HashIncrementAsync(statusKey, field);
        await HashSetAsync(statusKey, Constants.DeleteOperationStatus.LastUpdatedAt, DateTime.UtcNow.ToString("M/d/yyyy h:mm:ss tt"));
    }

    public async Task UpdateFieldStatusOperation(string operationId, string keyName, string keyValue)
    {
        var statusKey = $"{_options.QueueName}:status:{operationId.ToLower()}";
        await HashSetAsync(statusKey, keyName, keyValue);
        await HashSetAsync(statusKey, Constants.DeleteOperationStatus.LastUpdatedAt, DateTime.UtcNow.ToString("M/d/yyyy h:mm:ss tt"));
    }
}
