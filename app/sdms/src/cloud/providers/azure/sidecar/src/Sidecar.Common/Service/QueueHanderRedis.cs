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

namespace Sidecar.Common.Service
{
    using Microsoft.Extensions.Logging;
    using StackExchange.Redis;

    using Model;
    using Utilitiy;

    public class QueueHanderRedis : IDeletionOperationQueueHandler<IOptions, IDeleteOperationStatus>
    {
        private readonly ILogger<QueueHanderRedis> Logger;
        private readonly IOptions Options;
        private ConnectionMultiplexer Client;

        public QueueHanderRedis(ILogger<QueueHanderRedis> logger, IOptions options)
        {
            Logger = logger;
            Options = options;
            ValidateOptions();
            Client = PrepareClient();
        }

        private ConnectionMultiplexer PrepareClient()
        {
            Logger.LogInformation("Establishing Redis Connection...");

            var client = ConnectionMultiplexer.Connect(Options.RedisQueueConnectionString!);

            Logger.LogInformation("Established Redis Connection ");
            return client;
        }

        private void ValidateOptions()
        {
            ArgumentNullException.ThrowIfNull(Options, nameof(Options));
            var exceptions = new List<Exception>();

            if (string.IsNullOrEmpty(Options.RedisQueueConnectionString))
            {
                exceptions.Add(new ArgumentException("Redis connection string is required."));
            }

            if (string.IsNullOrEmpty(Options.DeletionQueueName))
            {
                exceptions.Add(new ArgumentException("Queue Name is required."));
            }

            if (exceptions.Count == 0)
            {
                return;
            }

            throw new AggregateException(exceptions);

        }

        public void Enqueue<TMesageType>(string key, TMesageType value)
        {
            throw new NotImplementedException();
        }

        public TMesageType Dequeue<TMesageType>(string key)
        {
            throw new NotImplementedException();
        }

        public async Task<IDeleteOperationStatus?> CheckForDeletionOperationAsync()
        {
            IDatabase db;
            try
            {
                db = Client.GetDatabase();
            }
            catch (Exception ex)
            {
                Logger.LogError(ex, "Error connecting to Redis database");
                throw;
            }

            //var trans = db.CreateTransaction();
            //trans.AddCondition(Condition.KeyNotExists(statusKey));

            var delQ = Options.DeletionQueueName;
            if(!await db.KeyExistsAsync(delQ)){
                Logger.LogError("Queue {q} does not exist", delQ);
                throw new RedisException("Queue does not exist");
            }
            var op = await db.ListLeftPopAsync(delQ);
            if(!op.HasValue){
                Logger.LogDebug("Deletion queue {q} is empty", delQ);
                return null;
            }

            var opDataKey = Options.DeletionQueueName + ":" + op.ToString();

            var delOpData = await db.HashGetAllAsync(opDataKey);
            if(delOpData.Length == 0){
                Logger.LogError("Failed to get operation data from queue for operation id {q}", opDataKey);
                throw new RedisException("Failed to get operation data from queue");
            }

            //---not the best approach but works for now...can revisit with an extension method later
            var msgValues = delOpData.ToDictionary(x => x.Name, x => x.Value);

            //---make sure that the expected values are present
            if(!msgValues.ContainsKey("operation_id") ||
                !msgValues.ContainsKey("subproject") ||
                !msgValues.ContainsKey("tenant") ||
                !msgValues.ContainsKey("path"))
            {
                Logger.LogError("Failed to get operation data from queue for operation id {q}", opDataKey);
                throw new RedisException("Failed to get operation data from queue");
            }

            var status = new DeleteOperationStatus{
                OperationId = msgValues["operation_id"].ToString(),
                Tenant = msgValues["tenant"].ToString(),
                Subproject = msgValues["subproject"].ToString(),
                Path = msgValues["path"].ToString(),
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

            var statusKey = Options.DeletionQueueName + ":status:" + status.OperationId.ToLower();
            await db.HashSetAsync(statusKey, statusHash);
            return status!;

        }
    }
}
