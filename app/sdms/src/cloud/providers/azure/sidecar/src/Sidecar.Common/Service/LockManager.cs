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
using Sidecar.Common.Interface;
using Sidecar.Common.Utility;

public class LockManager : ILockManager
{
    private static readonly TimeSpan _ttl = TimeSpan.FromSeconds(6);
    private readonly IRedisHandler _locksRedis;
    private readonly ILogger<LockManager> _logger;

    public LockManager(ILogger<LockManager> logger, IRedisConnectionFactory<RedisLocksConnectionFactory> redisConnectionFactory)
    {
        _logger = logger;
        _locksRedis = redisConnectionFactory.GetRedis();
    }

    private async Task<object?> GetLockAsync(string key)
    {
        var entity = await _locksRedis.GetAsync(key);
        return entity != null ? entity.StartsWith("rms") ? entity[4..].Split(':') : entity : null;
    }

    private async Task AcquireMutexAsync(string key, string? value = "")
    {
        var lockKey = "locks:" + key;
        var mutex = string.IsNullOrEmpty(value) ? Environment.MachineName : value;
        var acquired = await _locksRedis.GetDatabase().LockTakeAsync(lockKey, mutex, _ttl);
        if (!acquired)
        {
            throw new($"Cannot lock key {key}. Please try again shortly.");
        }
    }

    private async Task ReleaseMutexAsync(string key, string? value = "")
    {
        var lockKey = "locks:" + key;
        var mutex = string.IsNullOrEmpty(value) ? Environment.MachineName : value;
        _ = await _locksRedis.GetDatabase().LockReleaseAsync(lockKey, mutex);
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
            _logger.LogError(e, "Cannot acquire mutex {key}. ", key);
            return false;
        }

        var lockValue = await GetLockAsync(key);
        if (lockValue is string s)
        {
            await ReleaseMutexAsync(key);
            return s.StartsWith(Constants.DELETE_LOCK_PREFIX);
        }

        var result = await _locksRedis.SetAsync(key, Utils.GenerateDeleteLockId());
        await ReleaseMutexAsync(key);
        return result;
    }

    /// <inheritdoc cref="ILockManager.AcquireWriteLockAsync"/>
    public async Task<WriteLockSession> AcquireWriteLockAsync(string key)
    {
        var mutex = Utils.RandomMutex();
        try
        {
            await AcquireMutexAsync(key, mutex);
        }
        catch (Exception e)
        {
            _logger.LogError(e, "Cannot acquire mutex {key}. ", key);
        }

        var lockValue = await GetLockAsync(key);

        // unlocked dataset (no lock values)
        if (lockValue is null)
        {
            var wid = Utils.GenerateWriteLockId();
            var result = await _locksRedis.SetAsync(key, wid);
            await ReleaseMutexAsync(key, mutex);
            if (result)
            {
                return new WriteLockSession()
                {
                    Wid = wid,
                    Key = key,
                    Locked = true
                };
            }
        }
        await ReleaseMutexAsync(key, mutex);
        return new WriteLockSession();
    }

    /// <inheritdoc cref="ILockManager.RemoveDeleteLockAsync"/>
    public async Task<bool> RemoveDeleteLockAsync(string key)
    {
        try
        {
            await AcquireMutexAsync(key);
        }
        catch (Exception e)
        {
            _logger.LogError(e, "Cannot acquire mutex {key}. ", key);
            return false;
        }

        var lockValue = await GetLockAsync(key);
        if (lockValue is string s)
        {
            if (s.StartsWith(Constants.DELETE_LOCK_PREFIX))
            {
                var deleteStatus = await _locksRedis.DeleteAsync(key);
                await ReleaseMutexAsync(key);
                return deleteStatus;
            }

            _logger.LogError("Could not delete lock for {key}. {value} is not a delete lock. ", key, lockValue);
            await ReleaseMutexAsync(key);
            return false;
        }

        _logger.LogError("Could not delete lock for {key}. Value is not a delete lock. ", key);
        await ReleaseMutexAsync(key);
        return false;
    }

    public async Task<bool> RemoveWriteLockAsync(WriteLockSession session)
    {
        var mutex = Utils.RandomMutex();
        try
        {
            await AcquireMutexAsync(session.Key, mutex);
        }
        catch (Exception e)
        {
            _logger.LogError(e, "Cannot acquire mutex {key}. ", session.Key);
            return false;
        }

        var lockValue = await GetLockAsync(session.Key);
        if (lockValue is string s)
        {
            if (s.Equals(session.Wid))
            {
                var deleteStatus = await _locksRedis.DeleteAsync(session.Key);
                await ReleaseMutexAsync(session.Key, mutex);
                _logger.LogInformation("Write Lock for {key} removed.", session.Key);
                return deleteStatus;
            }
            _logger.LogError("Could not delete lock for {key}. {value} is not a current lock value.", session.Key, lockValue);
            return false;

        }
        _logger.LogDebug("Write Lock for {key} not found. Lock not removed.", session.Key);
        await ReleaseMutexAsync(session.Key, mutex);
        return false;
    }
}
