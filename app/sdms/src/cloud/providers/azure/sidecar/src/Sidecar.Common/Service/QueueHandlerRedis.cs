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
    using System.Data.Common;

    public class QueueHandlerRedis<TOptions> : IQueueHandler<Model.IRedisQueueOptions>
        where TOptions : Model.IRedisQueueOptions
    {
        protected readonly ILogger<QueueHandlerRedis<TOptions>> Logger;
        protected readonly Model.IRedisQueueOptions Options;
        protected ConnectionMultiplexer Client;

        public QueueHandlerRedis(ILogger<QueueHandlerRedis<TOptions>> logger, Model.IRedisQueueOptions options)
        {
            Logger = logger;
            Options = options;
            ValidateOptions();
            Client = PrepareClient();
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
            ArgumentNullException.ThrowIfNull(Options, nameof(Options));
            var exceptions = new List<Exception>();

            if (string.IsNullOrEmpty(Options.QueueConnectionString))
            {
                exceptions.Add(new ArgumentException("Redis connection string is required."));
            }

            if (string.IsNullOrEmpty(Options.QueueName))
            {
                exceptions.Add(new ArgumentException("Queue Name is required."));
            }

            if (exceptions.Count == 0)
            {
                return;
            }

            throw new AggregateException(exceptions);
        }

        public virtual T Dequeue<T>(string key) where T : class, IQueueMessage
        {
            throw new NotImplementedException();
        }

        public virtual void Enqueue<T>(string key, T value) where T : class, IQueueMessage
        {
            throw new NotImplementedException();
        }

        public virtual long HashDecrement(string key, string field, int? decBy = 1)
        {
            try{
                return Client.GetDatabase().HashDecrement(new RedisKey(key)
                    , new RedisValue(field)
                    , decBy!.Value);

            }catch(Exception ex){
                Logger.LogError(ex,"Unable to decrement hash for key {key} and field {field}",key,field);
                throw;
            }
        }

        public virtual async Task<long> HashDecrementAsync(string key, string field, int? decBy = 1)
        {
            try{
                return await Client.GetDatabase().HashDecrementAsync(new RedisKey(key)
                    , new RedisValue(field)
                    , decBy!.Value);

            }catch(Exception ex){
                Logger.LogError(ex,"Unable to decrement hash for key {key} and field {field}",key,field);
                throw;
            }

        }

        public virtual async Task<long> HashIncrementAsync(string key, string field, int? incBy = 1)
        {
            try{
                return await Client.GetDatabase().HashIncrementAsync(new RedisKey(key)
                    , new RedisValue(field)
                    , incBy!.Value);

            }catch(Exception ex){
                Logger.LogError(ex,"Unable to decrement hash for key {key} and field {field}",key,field);
                throw;
            }
        }
        public virtual long HashIncrement(string key, string field, int? incBy = 1)
        {
            try{
                return Client.GetDatabase().HashIncrement(new RedisKey(key)
                    , new RedisValue(field)
                    , incBy!.Value);

            }catch(Exception ex){
                Logger.LogError(ex,"Unable to decrement hash for key {key} and field {field}",key,field);
                throw;
            }
        }

        public virtual bool HashSet(string key, string field, string value)
        {
            try{
                return Client.GetDatabase().HashSet(new RedisKey(key)
                    , new RedisValue(field)
                    , new RedisValue(value));

            }catch(Exception ex){
                Logger.LogError(ex,"Unable to decrement hash for key {key} and field {field}",key,field);
                throw;
            }
        }

        public virtual async Task<bool> HashSetAsync(string key, string field, string value)
        {
            try{
                return await Client.GetDatabase().HashSetAsync(new RedisKey(key)
                    , new RedisValue(field)
                    , new RedisValue(value));

            }catch(Exception ex){
                Logger.LogError(ex,"Unable to decrement hash for key {key} and field {field}",key,field);
                throw;
            }
        }
    }
}
