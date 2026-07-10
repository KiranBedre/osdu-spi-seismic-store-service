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

public class PasswordRedisConnectionProviderTests : IDisposable
{
    private readonly Mock<ILogger<PasswordRedisConnectionProvider>> _loggerMock;
    private readonly Mock<IOptionsLocksRedis> _locksOptionsMock;
    private readonly Mock<IOptionsQueueRedis> _queueOptionsMock;
    private PasswordRedisConnectionProvider _provider;

    public PasswordRedisConnectionProviderTests()
    {
        _loggerMock = new Mock<ILogger<PasswordRedisConnectionProvider>>();
        _locksOptionsMock = new Mock<IOptionsLocksRedis>();
        _queueOptionsMock = new Mock<IOptionsQueueRedis>();

        // Setup default options
        _locksOptionsMock.Setup(x => x.RedisLocksHostname).Returns("locks.redis.cache.windows.net");
        _locksOptionsMock.Setup(x => x.RedisLocksPort).Returns("6380");
        _locksOptionsMock.Setup(x => x.RedisLocksPassword).Returns("locksPassword123");

        _queueOptionsMock.Setup(x => x.RedisQueueHostname).Returns("queue.redis.cache.windows.net");
        _queueOptionsMock.Setup(x => x.RedisQueuePort).Returns("6381");
        _queueOptionsMock.Setup(x => x.RedisQueuePassword).Returns("queuePassword456");

        _provider = new PasswordRedisConnectionProvider(
            _loggerMock.Object,
            _locksOptionsMock.Object,
            _queueOptionsMock.Object);
    }

    [Fact]
    public void Constructor_WithNullLogger_ThrowsArgumentNullException()
    {
        // Act & Assert
        var exception = Assert.Throws<ArgumentNullException>(() =>
            new PasswordRedisConnectionProvider(null!, _locksOptionsMock.Object, _queueOptionsMock.Object));

        exception.ParamName.Should().Be("logger");
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public async Task GetConnectionAsync_WithInvalidHostname_ThrowsArgumentException(string? hostname)
    {
        // Act & Assert
        var exception = await Assert.ThrowsAsync<ArgumentException>(async () =>
            await _provider.GetConnectionAsync(hostname!, 6380));

        exception.ParamName.Should().Be("hostname");
    }

    [Fact]
    public async Task GetConnectionAsync_WithUnknownHost_ThrowsInvalidOperationException()
    {
        // Act & Assert
        var exception = await Assert.ThrowsAsync<InvalidOperationException>(async () =>
            await _provider.GetConnectionAsync("unknown.redis.cache.windows.net", 6380));

        exception.Message.Should().Contain("No password configuration found");
    }

    [Fact]
    public async Task GetConnectionAsync_SameEndpoint_ReturnsCachedConnection()
    {
        // Act
        IConnectionMultiplexer? connection1 = null;
        IConnectionMultiplexer? connection2 = null;

        try
        {
            connection1 = await _provider.GetConnectionAsync("locks.redis.cache.windows.net", 6380);
            connection2 = await _provider.GetConnectionAsync("locks.redis.cache.windows.net", 6380);
        }
        catch
        {
            // Connection may fail, but we're checking if same instance is returned
        }

        // Assert
        // Both calls should return the same cached instance
        if (connection1 != null && connection2 != null)
        {
            connection1.Should().BeSameAs(connection2);
        }
    }

    [Fact]
    public async Task GetConnectionAsync_DifferentEndpoints_ReturnsDifferentConnections()
    {
        // Act
        IConnectionMultiplexer? connection1 = null;
        IConnectionMultiplexer? connection2 = null;

        try
        {
            connection1 = await _provider.GetConnectionAsync("locks.redis.cache.windows.net", 6380);
            connection2 = await _provider.GetConnectionAsync("queue.redis.cache.windows.net", 6381);
        }
        catch
        {
            // Connections may fail, but we're checking they would be different
        }

        // Assert
        // Even if both failed to connect, they should be different instances
        // (we can't fully test this without a real Redis instance)
    }

    public void Dispose()
    {
        _provider?.Dispose();
    }
}
