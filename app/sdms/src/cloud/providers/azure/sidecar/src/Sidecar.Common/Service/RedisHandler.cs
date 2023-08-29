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
using Newtonsoft.Json;

using Interface;

public class RedisHandler : IRedisHandler
{
    protected readonly ILogger<RedisHandler> Logger;
    protected IConnectionMultiplexer Client;

    public RedisHandler(ILogger<RedisHandler> logger, IConnectionMultiplexer connectionMultiplexer)

    {
        Logger = logger;
        Client = connectionMultiplexer;
    }

    protected IDatabase GetDatabase() {
        try
        {
            return Client.GetDatabase();
        }
        catch (Exception ex)
        {
            Logger.LogError(ex, "Error connecting to Redis database");
            throw;
        }
    }

    public long HashDecrement(string key, string field, long? decBy = 1)
    {
        try
        {
            var dec = decBy ?? 1;
            return GetDatabase().HashDecrement(new RedisKey(key)
                , new RedisValue(field)
                , dec);

        }
        catch (Exception ex)
        {
            Logger.LogError(ex, "Unable to decrement hash for key {key} and field {field}", key, field);
            throw;
        }
    }

    public async Task<long> HashDecrementAsync(string key, string field, long? decBy = 1)
    {
        try
        {
            var dec = decBy ?? 1 ;
            return await GetDatabase().HashDecrementAsync(new RedisKey(key)
                , new RedisValue(field)
                , dec);

        }
        catch (Exception ex)
        {
            Logger.LogError(ex, "Unable to decrement hash for key {key} and field {field}", key, field);
            throw;
        }

    }

    public virtual async Task<long> HashIncrementAsync(string key, string field, long? incBy = 1)
    {
        try
        {
            var inc = incBy ?? 1 ;
            return await GetDatabase().HashIncrementAsync(new RedisKey(key)
                , new RedisValue(field)
                , inc);

        }
        catch (Exception ex)
        {
            Logger.LogError(ex, "Unable to increment hash for key {key} and field {field}", key, field);
            throw;
        }
    }
    public virtual long HashIncrement(string key, string field, long? incBy = 1)
    {
        try
        {
            var inc = incBy ?? 1 ;
            return GetDatabase().HashIncrement(new RedisKey(key)
                , new RedisValue(field)
                , inc);

        }
        catch (Exception ex)
        {
            Logger.LogError(ex, "Unable to increment hash for key {key} and field {field}", key, field);
            throw;
        }
    }

    public virtual bool HashSet(string key, string field, string value)
    {
        try
        {
            return GetDatabase().HashSet(new RedisKey(key)
                , new RedisValue(field)
                , new RedisValue(value));

        }
        catch (Exception ex)
        {
            Logger.LogError(ex, "Unable to set hash for key {key} and field {field}", key, field);
            throw;
        }
    }

    public virtual async Task<bool> HashSetAsync(string key, string field, string value)
    {
        try
        {
            return await GetDatabase().HashSetAsync(new RedisKey(key)
                , new RedisValue(field)
                , new RedisValue(value));

        }
        catch (Exception ex)
        {
            Logger.LogError(ex, "Unable to set hash for key {key} and field {field}", key, field);
            throw;
        }
    }

    public async Task<T> HashGetAsync<T>(string key, string field) where T : unmanaged
    {
        try
        {
            var res =  await GetDatabase().HashGetAsync(new RedisKey(key)
                , new RedisValue(field));
            return JsonConvert.DeserializeObject<T>(res.ToString());
        }
        catch (Exception ex)
        {
            Logger.LogError(ex, "Unable to set hash for key {key} and field {field}", key, field);
            throw;
        }
    }

    public T HashGet<T>(string key, string field) where T : unmanaged
    {
        try
        {
            var res =  GetDatabase().HashGet(new RedisKey(key)
                    , new RedisValue(field));
            return JsonConvert.DeserializeObject<T>(res.ToString());
        }
        catch (Exception ex)
        {
            Logger.LogError(ex, "Unable to set hash for key {key} and field {field}", key, field);
            throw;
        }
    }

    public async Task<string?> GetAsync(string key)
    {
        return await GetDatabase().StringGetAsync(key);
    }

    public async Task<bool> SetAsync(string key, string value)
    {
        return await GetDatabase().StringSetAsync(key, value);
    }

    public async Task SetAsync(RedisKey key, HashEntry[] hash)
    {
        await GetDatabase().HashSetAsync(key, hash);
    }

    public long ListLeftPush(RedisKey key, RedisValue val)
    {
        return GetDatabase().ListLeftPush(key, new RedisValue(val!));
    }

    public long ListLeftPush(RedisKey key, string val)
    {
        return ListLeftPush(key, new RedisValue(val));
    }

    public async Task<long> ListLeftPushAsync(RedisKey key, RedisValue val)
    {
        return await GetDatabase().ListLeftPushAsync(key, new RedisValue(val!));
    }

    public async Task<long> ListLeftPushAsync(RedisKey key, string val)
    {
        return await ListLeftPushAsync(key, new RedisValue(val));
    }

    public void Set(RedisKey key, HashEntry[] hashes)
    {
        GetDatabase().HashSet(key, hashes);
    }

    public async Task<bool> DeleteAsync(string key)
    {
        return await GetDatabase().KeyDeleteAsync(key);
    }
}
