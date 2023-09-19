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
    private readonly Mock<IDatabase> _dbMock;
    public LockManagerTests()
    {
        _dbMock = TestingHelpers.GetDatabase();
        _connectionMultiplexer = TestingHelpers.GetConnectionMultiplexer(db: _dbMock.Object);

        var factoryMock = new Mock<IRedisConnectionFactory>();
        _ = factoryMock.Setup(m => m.GetRedisForLocks()).Returns(
            new RedisHandler(
                TestingHelpers.GetLogger<RedisHandler>().Object,
                _connectionMultiplexer.Object));

        var loggerFactory = new Mock<ILoggerFactory>();
        var loggerMock = new Mock<ILogger<LockManager>>();
        _lockManager = new(loggerMock.Object, factoryMock.Object);
    }

    [Fact]
    public async Task AcquireDeleteLock_WithLockDelete_ReturnsTrue()
    {
        // Arrange
        var databaseMock = new Mock<IDatabase>();
        _ = _connectionMultiplexer.Setup(c => c.GetDatabase(It.IsAny<int>(), It.IsAny<object>())).Returns(databaseMock.Object);
        var key = "/path/file.tst";
        _ = databaseMock.Setup(db => db.LockTakeAsync(It.IsAny<RedisKey>(), It.IsAny<RedisValue>(), It.IsAny<TimeSpan>(), It.IsAny<CommandFlags>()))
            .ReturnsAsync(true);
        _ = databaseMock.Setup(db => db.StringGetAsync(key, CommandFlags.None)).ReturnsAsync($"{Constants.DELETE_LOCK_PREFIX}:lockValue");

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
        var databaseMock = new Mock<IDatabase>();
        _ = _connectionMultiplexer.Setup(c => c.GetDatabase(It.IsAny<int>(), It.IsAny<object>())).Returns(databaseMock.Object);
        var key = "/path/file.tst";
        _ = databaseMock.Setup(db => db.LockTakeAsync(It.IsAny<RedisKey>(), It.IsAny<RedisValue>(), It.IsAny<TimeSpan>(), It.IsAny<CommandFlags>()))
            .ReturnsAsync(true);
        _ = databaseMock.Setup(db => db.StringGetAsync(key, CommandFlags.None)).ReturnsAsync(lockValue);

        // Act
        var result = await _lockManager.AcquireDeleteLockAsync(key);

        // Assert
        Assert.False(result);
    }

    [Fact]
    public async Task AcquireDeleteLock_WithoutLock_ReturnsTrue()
    {
        // Arrange
        var databaseMock = new Mock<IDatabase>();
        _ = _connectionMultiplexer.Setup(c => c.GetDatabase(It.IsAny<int>(), It.IsAny<object>())).Returns(databaseMock.Object);
        var key = "/path/file.tst";
        _ = databaseMock.Setup(db => db.LockTakeAsync(It.IsAny<RedisKey>(), It.IsAny<RedisValue>(), It.IsAny<TimeSpan>(), It.IsAny<CommandFlags>()))
            .ReturnsAsync(true);
        _ = databaseMock.Setup(db => db.StringGetAsync(key, CommandFlags.None)).ReturnsAsync((string?)null);
        _ = databaseMock
           .Setup(client => client.StringSetAsync(
               It.IsAny<RedisKey>(),
               It.IsAny<RedisValue>(),
               It.IsAny<TimeSpan?>(),
               It.IsAny<bool>(),
               It.IsAny<When>(),
               It.IsAny<CommandFlags>()
           ))
           .ReturnsAsync(true);

        // Act
        var result = await _lockManager.AcquireDeleteLockAsync(key);

        // Assert
        Assert.True(result);
    }

    [Fact]
    public async Task AcquireDeleteLock_WithoutMutex_ReturnsFalse()
    {
        // Arrange
        var databaseMock = new Mock<IDatabase>();
        _ = _connectionMultiplexer.Setup(c => c.GetDatabase(It.IsAny<int>(), It.IsAny<object>())).Returns(databaseMock.Object);

        _ = databaseMock.Setup(db => db.LockTakeAsync(It.IsAny<RedisKey>(), It.IsAny<RedisValue>(), It.IsAny<TimeSpan>(), It.IsAny<CommandFlags>()))
                    .ThrowsAsync(new Exception("Lock take failed"));

        // Act
        var result = await _lockManager.AcquireDeleteLockAsync("key");

        // Assert
        Assert.False(result);
    }
}
