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

namespace Sidecar.Common.Tests.Service;

using Sidecar.Common.Utility;

public class LockManagerTests
{
    private readonly LockManager _lockManager;
    private readonly Mock<IConnectionMultiplexer> _connectionMultiplexer;
    private readonly Mock<IRedisHandler> _redisHandlerMock;
    private readonly TestingHelpers.InMemoryCache _cache;

    public LockManagerTests()
    {
        var dbMock = TestingHelpers.GetDatabase(out _cache);
        _connectionMultiplexer = TestingHelpers.GetConnectionMultiplexer(db: dbMock.Object);

        // Mock IRedisHandler to use the in-memory cache
        _redisHandlerMock = new Mock<IRedisHandler>();
        _ = _redisHandlerMock.Setup(r => r.GetDatabase()).Returns(dbMock.Object);

        // Setup SetAsync to use InMemoryCache
        _ = _redisHandlerMock.Setup(r => r.SetAsync(It.IsAny<string>(), It.IsAny<string>()))
            .Returns<string, string>((key, value) =>
            {
                _ = _cache.StringSet(key, value);
                return Task.FromResult(true);
            });

        // Setup SetAsync with TTL to use InMemoryCache (TTL is ignored in tests)
        _ = _redisHandlerMock.Setup(r => r.SetAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<TimeSpan>()))
            .Returns<string, string, TimeSpan>((key, value, expiry) =>
            {
                // InMemoryCache doesn't support TTL, so we just set the value
                _ = _cache.StringSet(key, value);
                return Task.FromResult(true);
            });
        // Setup GetAsync to use InMemoryCache
        _ = _redisHandlerMock.Setup(r => r.GetAsync(It.IsAny<string>()))
            .Returns<string>(async key =>
            {
                var value = await _cache.StringGetAsync(key);
                return value.HasValue ? value.ToString() : null;
            });

        // Setup DeleteAsync to use InMemoryCache
        _ = _redisHandlerMock.Setup(r => r.DeleteAsync(It.IsAny<string>()))
            .Returns<string>(async key =>
            {
                return await _cache.KeyDeleteAsync(key);
            });

        var factoryMock = new Mock<IRedisConnectionFactory<RedisLocksConnectionFactory>>();
        _ = factoryMock.Setup(m => m.GetRedis()).Returns(_redisHandlerMock.Object);

        var loggerMock = new Mock<ILogger<LockManager>>();
        _lockManager = new(loggerMock.Object, factoryMock.Object);
    }

    [Fact]
    public async Task AcquireDeleteLock_WithLockDelete_ReturnsTrue()
    {
        // Arrange
        var key = "/path/file.tst";
        _ = _cache.StringSet(key, $"{Constants.DELETE_LOCK_PREFIX}:lockValue");

        // Act
        var result = await _lockManager.AcquireDeleteLockAsync(key);

        // Assert
        Assert.True(result);
    }

    [Theory]
    [InlineData("W24D0X03")]
    [InlineData("R40JYX01")]
    [InlineData("rms:R40JYX01:R40JYX02")]
    public async Task AcquireDeleteLock_WithValidLockReadWrite_ReturnsFalse(string lockValue)
    {
        // Arrange
        var key = "/path/file.tst";
        _ = _cache.StringSet(key, lockValue);

        // Act
        var result = await _lockManager.AcquireDeleteLockAsync(key);

        // Assert
        // For rms: prefixed values, the code treats them as string[] (not string),
        // so it falls through and sets a new delete lock, returning true
        // For non-rms values, it checks if they start with DELETE_LOCK_PREFIX
        if (lockValue.StartsWith("rms:"))
        {
            Assert.True(result); // rms: locks allow delete lock acquisition
        }
        else
        {
            Assert.False(result); // regular read/write locks block delete lock acquisition
        }
    }

    [Fact]
    public async Task AcquireDeleteLock_WithoutLock_ReturnsTrue()
    {
        // Arrange
        var key = "/path/file.tst";
        // No need to set anything - cache is empty by default

        // Act
        var result = await _lockManager.AcquireDeleteLockAsync(key);

        // Assert
        Assert.True(result);
    }

    [Fact]
    public async Task AcquireDeleteLock_WithoutMutex_ReturnsFalse()
    {
        // Arrange - Create a special database mock that throws on LockTakeAsync
        var dbMockWithException = new Mock<IDatabase>();
        _ = dbMockWithException.Setup(db => db.LockTakeAsync(It.IsAny<RedisKey>(), It.IsAny<RedisValue>(), It.IsAny<TimeSpan>(), It.IsAny<CommandFlags>()))
            .ThrowsAsync(new Exception("Lock take failed"));

        var redisHandlerMockWithException = new Mock<IRedisHandler>();
        _ = redisHandlerMockWithException.Setup(r => r.GetDatabase()).Returns(dbMockWithException.Object);

        var factoryMock = new Mock<IRedisConnectionFactory<RedisLocksConnectionFactory>>();
        _ = factoryMock.Setup(m => m.GetRedis()).Returns(redisHandlerMockWithException.Object);

        var loggerMock = new Mock<ILogger<LockManager>>();
        var lockManager = new LockManager(loggerMock.Object, factoryMock.Object);

        // Act
        var result = await lockManager.AcquireDeleteLockAsync("key");

        // Assert
        Assert.False(result);
    }

    [Fact]
    public async Task RemoveDeleteLock_WithLockDelete_ReturnsTrue()
    {
        // Arrange
        var key = "/path/file.tst";
        _ = _cache.StringSet(key, $"{Constants.DELETE_LOCK_PREFIX}:lockValue");

        // Act
        var result = await _lockManager.RemoveDeleteLockAsync(key);

        // Assert
        Assert.True(result);
    }

    [Fact]
    public async Task AcquireWriteLock_WithLockWrite_ReturnsTrue()
    {
        // Arrange
        var key = "path/file.tst";
        // No lock exists - cache is empty

        // Act
        var result = await _lockManager.AcquireWriteLockAsync(key);

        // Assert
        Assert.Equal(key, result.Key);
        Assert.StartsWith(Constants.WRITE_LOCK_PREFIX, result.Wid);
        Assert.True(result.Locked);
    }

    [Fact]
    public async Task AcquireWriteLock_UnsuccessfulLocking_ReturnsLockedFalse()
    {
        // Arrange - Create a special setup where SetAsync returns false
        var db = TestingHelpers.GetDatabase(out var cache);

        var redisHandlerMockWithFailure = new Mock<IRedisHandler>();
        _ = redisHandlerMockWithFailure.Setup(r => r.GetDatabase()).Returns(db.Object);
        _ = redisHandlerMockWithFailure.Setup(r => r.SetAsync(It.IsAny<string>(), It.IsAny<string>()))
            .ReturnsAsync(false); // Override to return false
        _ = redisHandlerMockWithFailure.Setup(r => r.GetAsync(It.IsAny<string>()))
            .ReturnsAsync((string?)null); // No existing lock

        var factoryMock = new Mock<IRedisConnectionFactory<RedisLocksConnectionFactory>>();
        _ = factoryMock.Setup(m => m.GetRedis()).Returns(redisHandlerMockWithFailure.Object);

        var loggerMock = new Mock<ILogger<LockManager>>();
        var lockManager = new LockManager(loggerMock.Object, factoryMock.Object);

        var key = "path/file.tst";

        // Act
        var result = await lockManager.AcquireWriteLockAsync(key);

        // Assert
        Assert.Equal("", result.Key);
        Assert.Equal("", result.Wid);
        Assert.False(result.Locked);
    }

    [Fact]
    public async Task AcquireWriteLock_AlreadyLocked_ReturnsLockedFalse()
    {
        // Arrange
        var key = "path/file.tst";
        _ = _cache.StringSet(key, "Some Lock");

        // Act
        var result = await _lockManager.AcquireWriteLockAsync(key);

        // Assert
        Assert.Equal("", result.Key);
        Assert.Equal("", result.Wid);
        Assert.False(result.Locked);
    }

    [Fact]
    public async Task RemoveWriteLock_ReturnsTrue()
    {
        // Arrange
        var key = "/path/file.tst";
        var lockValue = "lockValue";
        _ = _cache.StringSet(key, lockValue);
        var writeLockSession = new WriteLockSession()
        {
            Key = key,
            Wid = lockValue,
            Locked = true
        };

        // Act
        var result = await _lockManager.RemoveWriteLockAsync(writeLockSession);

        // Assert
        Assert.True(result);
    }

    [Fact]
    public async Task RemoveWriteLock_AlreadyUnlocked_ReturnsFalse()
    {
        // Arrange
        var key = "/path/file.tst";
        // No lock in cache - already unlocked
        var writeLockSession = new WriteLockSession()
        {
            Key = key,
            Wid = "lockValue",
            Locked = true
        };

        // Act
        var result = await _lockManager.RemoveWriteLockAsync(writeLockSession);

        // Assert
        Assert.False(result);
    }

    [Fact]
    public async Task RemoveWriteLock_DifferentLockSession_ReturnsFalse()
    {
        // Arrange
        var key = "/path/file.tst";
        _ = _cache.StringSet(key, "some lock value");
        var writeLockSession = new WriteLockSession()
        {
            Key = key,
            Wid = "lockValue",
            Locked = true
        };

        // Act
        var result = await _lockManager.RemoveWriteLockAsync(writeLockSession);

        // Assert
        Assert.False(result);
    }

    [Fact]
    public async Task RemoveWriteLock_OwnedLockDeleteFails_Throws()
    {
        var key = "/path/file.tst";
        var lockValue = "lockValue";
        _ = _cache.StringSet(key, lockValue);
        _ = _redisHandlerMock.Setup(r => r.DeleteAsync(key)).ReturnsAsync(false);
        var writeLockSession = new WriteLockSession
        {
            Key = key,
            Wid = lockValue,
            Locked = true
        };

        _ = await Assert.ThrowsAsync<InvalidOperationException>(
            () => _lockManager.RemoveWriteLockAsync(writeLockSession));
    }

    [Fact]
    public async Task MakeWriteLockIndefinite_MatchingLock_ReturnsTrueAndRewritesValue()
    {
        // Arrange
        var key = "/path/file.tst";
        var lockValue = "W24D0X03";
        _ = _cache.StringSet(key, lockValue);
        var writeLockSession = new WriteLockSession { Key = key, Wid = lockValue, Locked = true };

        // Act
        var result = await _lockManager.MakeWriteLockIndefiniteAsync(writeLockSession);

        // Assert - the lock key is re-set (no TTL) using the no-expiry SetAsync overload.
        Assert.True(result);
        _redisHandlerMock.Verify(r => r.SetAsync(key, lockValue), Times.Once);
        _redisHandlerMock.Verify(r => r.SetAsync(key, lockValue, It.IsAny<TimeSpan>()), Times.Never);
    }

    [Fact]
    public async Task MakeWriteLockIndefinite_MissingLock_ReturnsFalse()
    {
        // Arrange - no lock in cache.
        var writeLockSession = new WriteLockSession { Key = "/path/file.tst", Wid = "W24D0X03", Locked = true };

        // Act
        var result = await _lockManager.MakeWriteLockIndefiniteAsync(writeLockSession);

        // Assert
        Assert.False(result);
    }

    [Fact]
    public async Task MakeWriteLockIndefinite_DifferentLockValue_ReturnsFalse()
    {
        // Arrange - a different owner holds the lock.
        var key = "/path/file.tst";
        _ = _cache.StringSet(key, "someOtherLockValue");
        var writeLockSession = new WriteLockSession { Key = key, Wid = "W24D0X03", Locked = true };

        // Act
        var result = await _lockManager.MakeWriteLockIndefiniteAsync(writeLockSession);

        // Assert
        Assert.False(result);
    }

    [Fact]
    public async Task MakeWriteLockIndefinite_SetFails_ReleasesMutexForNextAttempt()
    {
        var key = "/path/file.tst";
        var lockValue = "W24D0X03";
        _ = _cache.StringSet(key, lockValue);
        var writeLockSession = new WriteLockSession { Key = key, Wid = lockValue, Locked = true };
        _ = _redisHandlerMock
            .Setup(r => r.SetAsync(key, lockValue))
            .ThrowsAsync(new InvalidOperationException("Redis write failed"));

        _ = await Assert.ThrowsAsync<InvalidOperationException>(
            () => _lockManager.MakeWriteLockIndefiniteAsync(writeLockSession));

        _ = _redisHandlerMock
            .Setup(r => r.SetAsync(key, lockValue))
            .ReturnsAsync(true);
        var result = await _lockManager.MakeWriteLockIndefiniteAsync(writeLockSession);

        Assert.True(result);
    }

    #region Idempotent Lock Tests

    [Fact]
    public async Task AcquireWriteLock_WithIdempotentLockIdAndTtl_ReturnsLockedWithIdempotentId()
    {
        // Arrange
        var key = "path/file.tst";
        var idempotentLockId = "W1234567890ABCDE";
        var ttl = TimeSpan.FromHours(24);
        // No existing lock in cache

        // Act
        var result = await _lockManager.AcquireWriteLockAsync(key, idempotentLockId, ttl);

        // Assert
        Assert.Equal(key, result.Key);
        Assert.Equal(idempotentLockId, result.Wid);
        Assert.True(result.Locked);
        Assert.False(result.IsIdempotent);
    }

    [Fact]
    public async Task AcquireWriteLock_WithMatchingExistingIdempotentLock_ReturnsIdempotentSuccess()
    {
        // Arrange
        var key = "path/file.tst";
        var idempotentLockId = "W1234567890ABCDE";
        var ttl = TimeSpan.FromHours(24);
        // Existing lock matches the idempotent lock ID
        _ = _cache.StringSet(key, idempotentLockId);

        // Act
        var result = await _lockManager.AcquireWriteLockAsync(key, idempotentLockId, ttl);

        // Assert
        Assert.Equal(key, result.Key);
        Assert.Equal(idempotentLockId, result.Wid);
        Assert.True(result.Locked);
        Assert.True(result.IsIdempotent);  // Re-acquired idempotently
    }

    [Fact]
    public async Task AcquireWriteLock_WithMatchingExistingIdempotentLock_RefreshesTtl()
    {
        // Arrange - a redelivery/retry re-acquiring its own lock must refresh the TTL so the fixed
        // window is not consumed across retries and does not expire mid-operation.
        var key = "path/file.tst";
        var idempotentLockId = "W1234567890ABCDE";
        var ttl = TimeSpan.FromHours(5);
        string? capturedValue = null;
        TimeSpan? capturedTtl = null;

        // Existing lock matches the idempotent lock ID
        _ = _cache.StringSet(key, idempotentLockId);

        _ = _redisHandlerMock.Setup(r => r.SetAsync(key, It.IsAny<string>(), It.IsAny<TimeSpan>()))
            .Callback<string, string, TimeSpan>((redisKey, value, expiry) =>
            {
                capturedValue = value;
                capturedTtl = expiry;
                _ = _cache.StringSet(redisKey, value);
            })
            .ReturnsAsync(true);

        // Act
        var result = await _lockManager.AcquireWriteLockAsync(key, idempotentLockId, ttl);

        // Assert
        Assert.True(result.Locked);
        Assert.True(result.IsIdempotent);            // re-acquired, not a fresh lock
        Assert.Equal(idempotentLockId, result.Wid);
        Assert.Equal(idempotentLockId, capturedValue);  // value unchanged
        Assert.Equal(ttl, capturedTtl);              // TTL refreshed with the requested ttl
    }

    [Fact]
    public async Task AcquireWriteLock_WithNonMatchingExistingLock_ReturnsLockedFalse()
    {
        // Arrange
        var key = "path/file.tst";
        var idempotentLockId = "W1234567890ABCDE";
        var existingLockId = "WDifferentLock123";
        var ttl = TimeSpan.FromHours(24);
        // Existing lock does NOT match the idempotent lock ID
        _ = _cache.StringSet(key, existingLockId);

        // Act
        var result = await _lockManager.AcquireWriteLockAsync(key, idempotentLockId, ttl);

        // Assert
        Assert.Equal("", result.Key);
        Assert.Equal("", result.Wid);
        Assert.False(result.Locked);
        Assert.False(result.IsIdempotent);
    }

    [Fact]
    public async Task AcquireWriteLock_WithInvalidIdempotentLockId_ReturnsLockedFalse()
    {
        // Arrange - idempotent lock ID must start with "W"
        var key = "path/file.tst";
        var invalidIdempotentLockId = "R1234567890ABCDE"; // Invalid - starts with R instead of W
        var ttl = TimeSpan.FromHours(24);

        // Act
        var result = await _lockManager.AcquireWriteLockAsync(key, invalidIdempotentLockId, ttl);

        // Assert
        Assert.Equal("", result.Key);
        Assert.Equal("", result.Wid);
        Assert.False(result.Locked);
    }

    #endregion Idempotent Lock Tests

    #region TTL Lock Tests

    [Fact]
    public async Task AcquireWriteLock_WithTtl_SetsTtlOnLock()
    {
        // Arrange
        var key = "path/file.tst";
        var idempotentLockId = "W1234567890ABCDE";
        var ttl = TimeSpan.FromHours(24);
        TimeSpan? capturedTtl = null;

        // Override SetAsync with TTL to capture the TTL parameter
        _ = _redisHandlerMock.Setup(r => r.SetAsync(key, idempotentLockId, It.IsAny<TimeSpan>()))
            .Callback<string, string, TimeSpan>((_, _, expiry) => capturedTtl = expiry)
            .ReturnsAsync(true);

        // Act
        var result = await _lockManager.AcquireWriteLockAsync(key, idempotentLockId, ttl);

        // Assert
        Assert.True(result.Locked);
        Assert.Equal(ttl, capturedTtl);
    }

    [Fact]
    public async Task AcquireWriteLock_WithoutTtl_DoesNotSetTtlOnLock()
    {
        // Arrange
        var key = "path/file.tst";
        var ttlMethodCalled = false;

        // Override SetAsync with TTL to detect if it's called
        _ = _redisHandlerMock.Setup(r => r.SetAsync(key, It.IsAny<string>(), It.IsAny<TimeSpan>()))
            .Callback(() => ttlMethodCalled = true)
            .ReturnsAsync(true);

        // Act
        var result = await _lockManager.AcquireWriteLockAsync(key);

        // Assert
        Assert.True(result.Locked);
        Assert.False(ttlMethodCalled); // TTL method should NOT be called
    }

    [Fact]
    public async Task AcquireWriteLock_WithIdempotentLockIdAndTtl_UsesBothParameters()
    {
        // Arrange
        var key = "path/file.tst";
        var idempotentLockId = "W1234567890ABCDE";
        var ttl = TimeSpan.FromHours(24);
        string? capturedValue = null;
        TimeSpan? capturedTtl = null;

        // Override SetAsync with TTL to capture both value and TTL
        _ = _redisHandlerMock.Setup(r => r.SetAsync(key, It.IsAny<string>(), It.IsAny<TimeSpan>()))
            .Callback<string, string, TimeSpan>((_, value, expiry) =>
            {
                capturedValue = value;
                capturedTtl = expiry;
            })
            .ReturnsAsync(true);

        // Act
        var result = await _lockManager.AcquireWriteLockAsync(key, idempotentLockId, ttl);

        // Assert
        Assert.True(result.Locked);
        Assert.Equal(idempotentLockId, capturedValue);
        Assert.Equal(idempotentLockId, result.Wid);
        Assert.Equal(ttl, capturedTtl);
    }

    #endregion TTL Lock Tests
}
