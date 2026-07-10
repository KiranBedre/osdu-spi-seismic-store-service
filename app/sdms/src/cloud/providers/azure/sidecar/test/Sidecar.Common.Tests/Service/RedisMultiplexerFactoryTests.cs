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

public class RedisMultiplexerFactoryTests
{
    private readonly Mock<IRedisConnectionProvider> _providerMock;

    public RedisMultiplexerFactoryTests()
    {
        _providerMock = new Mock<IRedisConnectionProvider>();
    }

    [Fact]
    public void Constructor_WithNullProvider_ThrowsArgumentNullException()
    {
        // Act & Assert
        var exception = Assert.Throws<ArgumentNullException>(() =>
            new RedisMultiplexerFactory(null!));

        exception.ParamName.Should().Be("provider");
    }

    [Fact]
    public async Task GetConnection_CallsProviderGetConnectionAsync()
    {
        // Arrange
        var mockConnection = new Mock<IConnectionMultiplexer>();
        _providerMock
            .Setup(p => p.GetConnectionAsync("test.redis.cache.windows.net", 6380))
            .ReturnsAsync(mockConnection.Object);

        var factory = new RedisMultiplexerFactory(_providerMock.Object);

        // Act
        var result = await factory.GetConnectionAsync("test.redis.cache.windows.net", 6380);

        // Assert
        result.Should().BeSameAs(mockConnection.Object);
        _providerMock.Verify(
            p => p.GetConnectionAsync("test.redis.cache.windows.net", 6380),
            Times.Once);
    }

    [Fact]
    public async Task GetConnection_WithDifferentEndpoints_CallsProviderForEach()
    {
        // Arrange
        var mockConnection1 = new Mock<IConnectionMultiplexer>();
        var mockConnection2 = new Mock<IConnectionMultiplexer>();

        _providerMock
            .Setup(p => p.GetConnectionAsync("redis1.cache.windows.net", 6380))
            .ReturnsAsync(mockConnection1.Object);

        _providerMock
            .Setup(p => p.GetConnectionAsync("redis2.cache.windows.net", 6381))
            .ReturnsAsync(mockConnection2.Object);

        var factory = new RedisMultiplexerFactory(_providerMock.Object);

        // Act
        var result1 = await factory.GetConnectionAsync("redis1.cache.windows.net", 6380);
        var result2 = await factory.GetConnectionAsync("redis2.cache.windows.net", 6381);

        // Assert
        result1.Should().BeSameAs(mockConnection1.Object);
        result2.Should().BeSameAs(mockConnection2.Object);

        _providerMock.Verify(
            p => p.GetConnectionAsync("redis1.cache.windows.net", 6380),
            Times.Once);

        _providerMock.Verify(
            p => p.GetConnectionAsync("redis2.cache.windows.net", 6381),
            Times.Once);
    }
}
