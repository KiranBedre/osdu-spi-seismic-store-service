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

using Sidecar.Common.Interface;
using Sidecar.Common.Utility;

public class LockManager : ILockManager
{
    private static readonly TimeSpan _ttl = TimeSpan.FromSeconds(6);
    private readonly IRedisHandler _locksRedis;

    public LockManager(IRedisConnectionFactory redisConnectionFactory)
    {
        _locksRedis = redisConnectionFactory.GetRedisForLocks();
    }

    private async Task<object?> GetLockAsync(string key)
    {
        var entity = await _locksRedis.GetAsync(key);
        return entity != null ? entity.StartsWith("rms") ? entity[4..].Split(':') : entity : null;
    }

    private async Task AcquireMutexAsync(string key)
    {
        var lockKey = "locks:" + key;

        var acquired = await _locksRedis.GetDatabase().LockTakeAsync(lockKey, Environment.MachineName, _ttl);
        if (acquired)
        {
            return;
        }
        else
        {
            throw new Exception($"Cannot lock key {key}. Please try again shortly. ");
        }
    }

    private async Task ReleaseMutexAsync(string key)
    {
        var lockKey = "locks:" + key;
        _ = await _locksRedis.GetDatabase().LockReleaseAsync(lockKey, Environment.MachineName);
    }

    /// <inheritdoc cref="ILockManager.AcquireDeleteLockAsync"/>
    public async Task<bool> AcquireDeleteLockAsync(string key)
    {
        try
        {
            await AcquireMutexAsync(key);
        }
        catch (Exception e)
        {
            throw new Exception($"Cannot aquire mutex {key}. Please try again shortly. {e.Message} ");
        }

        var lockValue = await GetLockAsync(key);
        if (lockValue is not null and string)
        {
            await ReleaseMutexAsync(key);
            return ((string)lockValue).StartsWith("WDELETE");
        }

        var result = await _locksRedis.SetAsync(key, Utils.GenerateDeleteLockId());
        await ReleaseMutexAsync(key);
        return result;
    }
}
