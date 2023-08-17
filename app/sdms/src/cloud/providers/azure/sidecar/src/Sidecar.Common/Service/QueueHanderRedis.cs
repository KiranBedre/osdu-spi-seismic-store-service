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

    public class QueueHanderRedis : IQueueHandler<IQueueOptionsRedis, IDeleteOperationMessage>
    {
        private readonly ILogger<QueueHanderRedis> Logger;
        private readonly IQueueOptionsRedis Options;

        private ConnectionMultiplexer Client;

        public QueueHanderRedis(ILogger<QueueHanderRedis> logger, IQueueOptionsRedis options){
            Logger = logger;
            Options = options;
            ValidateOptions();
            Client = PrepareClient();
        }

        private ConnectionMultiplexer PrepareClient(){
            Logger.LogInformation("Establishing Redis Connection...");

            var client = ConnectionMultiplexer.Connect(Options.ConnectionString!);

            Logger.LogInformation("Established Redis Connection ");
            return client;
        }

        private void ValidateOptions(){
            ArgumentNullException.ThrowIfNull(Options,nameof(Options));
            var exceptions = new List<Exception>();

            if(string.IsNullOrEmpty(Options.ConnectionString)){
                exceptions.Add(new ArgumentException("Redis connection string is required."));
            }

            if(string.IsNullOrEmpty(Options.QueueName)){
                exceptions.Add(new ArgumentException("Queue Name is required."));
            }

            if(exceptions.Count == 0)
            {
                return;
            }

            throw new AggregateException(exceptions);

        }

        public void Enqueue(string key, IDeleteOperationMessage value)
        {

        }

        public IDeleteOperationMessage Dequeue(string key, IDeleteOperationMessage value)
        {
            throw new NotImplementedException();
        }
    }
}