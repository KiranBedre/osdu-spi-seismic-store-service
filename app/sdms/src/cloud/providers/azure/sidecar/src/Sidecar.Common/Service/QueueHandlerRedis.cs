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

    public class QueueHanderRedis<TOptions> : IQueueHandler<Model.IRedisQueueOptions>
        where TOptions : Model.IRedisQueueOptions
    {
        protected readonly ILogger<QueueHanderRedis<TOptions>> Logger;
        protected readonly Model.IRedisQueueOptions Options;
        protected ConnectionMultiplexer Client;

        public QueueHanderRedis(ILogger<QueueHanderRedis<TOptions>> logger, Model.IRedisQueueOptions options)
        {
            Logger = logger;
            Options = options;
            ValidateOptions();
            Client = PrepareClient();
        }

        public T Dequeue<T>(string key) where T : class, IQueueMessage
        {
            throw new NotImplementedException();
        }

        public void Enqueue<T>(string key, T value) where T : class, IQueueMessage
        {
            throw new NotImplementedException();
        }

        protected ConnectionMultiplexer PrepareClient()
        {
            Logger.LogInformation("Establishing Redis Connection...");

            var client = ConnectionMultiplexer.Connect(Options.QueueConnectionString!);

            Logger.LogInformation("Established Redis Connection ");
            return client;
        }

        protected virtual void ValidateOptions()
        {
            throw new NotImplementedException();
        }

    }
}
