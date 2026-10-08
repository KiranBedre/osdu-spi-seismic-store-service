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
using Polly;
using Polly.Registry;
using Sidecar.Common.Interface;
using Sidecar.Common.Resilience;
using Sidecar.Common.Utility;

public class LockManager : ILockManager
{
    private static readonly TimeSpan _ttl = TimeSpan.FromSeconds(6);
    private readonly IRedisHandler _locksRedis;
    private readonly ILogger<LockManager> _logger;
    private readonly ResiliencePipeline _redisPipeline;

    public LockManager(
        ILogger<LockManager> logger,
        IRedisConnectionFactory<RedisLocksConnectionFactory> redisConnectionFactory,
        ResiliencePipelineProvider<string>? resiliencePipelineProvider = null)
    {
        _logger = logger;
        _locksRedis = redisConnectionFactory.GetRedis();
        _redisPipeline = resiliencePipelineProvider
            ?.GetPipeline(ResilienceExtensions.RedisPipeline) ?? ResiliencePipeline.Empty;
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
        // Lock exists - cannot acquire
        await ReleaseMutexAsync(key, mutex);
        return new WriteLockSession();
    }

    /// <inheritdoc cref="ILockManager.AcquireWriteLockAsync(string, string, TimeSpan)"/>
    public async Task<WriteLockSession> AcquireWriteLockAsync(string key, string idempotentLockId, TimeSpan ttl)
    {
        // Validate idempotent lock ID format (must start with "W" like NodeJS implementation)
        if (!idempotentLockId.StartsWith(Constants.WRITE_LOCK_PREFIX))
        {
            _logger.LogError("Invalid idempotent lock ID {LockId}: must start with '{Prefix}'",
                idempotentLockId, Constants.WRITE_LOCK_PREFIX);
            return new WriteLockSession();
        }

        var mutex = Utils.RandomMutex();
        try
        {
            await AcquireMutexAsync(key, mutex);
        }
        catch (Exception e)
        {
            _logger.LogError(e, "Cannot acquire mutex {key}. ", key);
            return new WriteLockSession();
        }

        var lockValue = await GetLockAsync(key);

        // Case 1: Lock already exists and matches idempotent key (idempotent call - re-acquire).
        // Refresh the TTL so a redelivered/retried operation extends its hold rather than running
        // on the residual lifetime of the original acquisition. Without this refresh the lock's
        // fixed TTL is consumed across successive retries and can expire while the operation is
        // still in progress, allowing a concurrent executor to acquire the same lock and race. The
        // stored value is unchanged (still our idempotent id); only the expiry is renewed.
        if (lockValue is string existingLock && existingLock == idempotentLockId)
        {
            var refreshed = await _locksRedis.SetAsync(key, idempotentLockId, ttl);
            await ReleaseMutexAsync(key, mutex);
            if (refreshed)
            {
                _logger.LogInformation("Idempotent lock re-acquisition (TTL refreshed) for {Key} with ID {LockId}", key, idempotentLockId);
            }
            else
            {
                // We still hold the lock (value matched); only the TTL extension failed. Proceed as
                // locked but warn, since the lock now retains its previous (shorter) expiry.
                _logger.LogWarning(
                    "Idempotent lock re-acquired for {Key} with ID {LockId} but TTL refresh failed; lock retains its previous expiry",
                    key, idempotentLockId);
            }

            return new WriteLockSession()
            {
                Wid = idempotentLockId,
                Key = key,
                Locked = true,
                IsIdempotent = true
            };
        }

        // Case 2: Unlocked dataset (no lock values) - create new lock with TTL
        if (lockValue is null)
        {
            var result = await _locksRedis.SetAsync(key, idempotentLockId, ttl);
            await ReleaseMutexAsync(key, mutex);
            if (result)
            {
                return new WriteLockSession()
                {
                    Wid = idempotentLockId,
                    Key = key,
                    Locked = true,
                    IsIdempotent = false
                };
            }
        }

        // Case 3: Lock exists but doesn't match idempotent key
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

    /// <inheritdoc cref="ILockManager.MakeWriteLockIndefiniteAsync"/>
    public async Task<bool> MakeWriteLockIndefiniteAsync(WriteLockSession session) =>
        await _redisPipeline.ExecuteAsync(
            async _ => await MakeWriteLockIndefiniteCoreAsync(session).ConfigureAwait(false)).ConfigureAwait(false);

    /// <summary>
    /// Core implementation of write lock TTL removal without retry logic. Re-writes the lock key with
    /// its current value and no expiry, which strips any existing TTL and makes the lock indefinite.
    /// </summary>
    private async Task<bool> MakeWriteLockIndefiniteCoreAsync(WriteLockSession session)
    {
        var mutex = Utils.RandomMutex();
        try
        {
            await AcquireMutexAsync(session.Key, mutex);
        }
        catch (Exception e) when (!ResilienceExtensions.IsTransientRedisError(e))
        {
            _logger.LogError(e, "Cannot acquire mutex {key}. ", session.Key);
            return false;
        }

        var lockValue = await GetLockAsync(session.Key);
        if (lockValue is string s)
        {
            if (s.Equals(session.Wid))
            {
                // Re-set the key with no expiry to remove the TTL, making the lock indefinite.
                var persisted = await _locksRedis.SetAsync(session.Key, session.Wid);
                await ReleaseMutexAsync(session.Key, mutex);
                _logger.LogWarning("Write Lock for {key} made indefinite (no TTL).", session.Key);
                return persisted;
            }
            _logger.LogError("Could not make lock indefinite for {key}. {value} is not a current lock value.", session.Key, lockValue);
            await ReleaseMutexAsync(session.Key, mutex);
            return false;
        }
        _logger.LogError("Could not make lock indefinite for {key}. Lock not found.", session.Key);
        await ReleaseMutexAsync(session.Key, mutex);
        return false;
    }
}
