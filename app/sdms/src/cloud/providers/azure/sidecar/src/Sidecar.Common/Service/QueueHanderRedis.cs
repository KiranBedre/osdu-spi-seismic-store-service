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
    using System.Runtime.CompilerServices;
    using System.Text.Json;

    public class QueueHanderRedis : IDeletionOperationQueueHandler<IQueueOptionsRedis, IDeleteOperationMessage>
    {
        private readonly ILogger<QueueHanderRedis> Logger;
        private readonly IQueueOptionsRedis Options;

        private ConnectionMultiplexer Client;

        public QueueHanderRedis(ILogger<QueueHanderRedis> logger, IQueueOptionsRedis options)
        {
            Logger = logger;
            Options = options;
            ValidateOptions();
            Client = PrepareClient();
        }

        private ConnectionMultiplexer PrepareClient()
        {
            Logger.LogInformation("Establishing Redis Connection...");

            var client = ConnectionMultiplexer.Connect(Options.ConnectionString!);

            Logger.LogInformation("Established Redis Connection ");
            return client;
        }

        private void ValidateOptions()
        {
            ArgumentNullException.ThrowIfNull(Options, nameof(Options));
            var exceptions = new List<Exception>();

            if (string.IsNullOrEmpty(Options.ConnectionString))
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

        public void Enqueue(string key, IDeleteOperationMessage value)
        {
            throw new NotImplementedException();
        }

        public IDeleteOperationMessage Dequeue(string key, IDeleteOperationMessage value)
        {
            throw new NotImplementedException();
        }

        public async Task<IDeleteOperationMessage?> CheckForDeletionOperationAsync()
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
            //---because the queue is using Bull (nodejs) need to get the id from the value and retrieve the actual payload
            var opDataKey = Options.DeletionQueueName + ":" + op.ToString();
            //---get the payload of the delete operation
            var data = await db.HashGetAllAsync(delQ);
            if(!op.HasValue){
                Logger.LogDebug("Queue {q} is empty", delQ);
                return null;
            }
            var msg = new DeleteOperationMessage(){
                Id = (long)op
            };
            return msg;

        }
    }
}