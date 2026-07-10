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

using Azure.Identity;
using Sidecar.Common.Interface;
using Sidecar.Common.Service;

/// <summary>
/// Tests for MsiRedisConnectionProvider.
///
/// NOTE: Token acquisition and refresh are now entirely handled by Microsoft.Azure.StackExchangeRedis.
/// These tests focus on:
/// - Constructor parameter validation
/// - Identity type configuration (system-assigned vs user-assigned)
/// - Connection lifecycle management
/// - Input validation for Redis endpoints
///
/// Token management details are tested by Microsoft's library, not here.
/// </summary>
public class MsiRedisConnectionProviderTests : IDisposable
{
    private readonly Mock<ILogger<MsiRedisConnectionProvider>> _loggerMock;
    private readonly Mock<IOptionsRedisMsi> _msiOptionsMock;
    private readonly ManagedIdentityCredential _credential;
    private readonly MsiRedisConnectionProvider _provider;

    public MsiRedisConnectionProviderTests()
    {
        _loggerMock = new Mock<ILogger<MsiRedisConnectionProvider>>();
        _msiOptionsMock = new Mock<IOptionsRedisMsi>();
        _credential = new ManagedIdentityCredential();

        _msiOptionsMock.Setup(x => x.RedisMsiEnabled).Returns("true");
        _msiOptionsMock.Setup(x => x.RedisClientId).Returns((string?)null);

        _provider = new MsiRedisConnectionProvider(
            _loggerMock.Object,
            _msiOptionsMock.Object,
            _credential);
    }

    #region Constructor Tests

    [Fact]
    public void Constructor_WithNullLogger_ThrowsArgumentNullException()
    {
        // Act & Assert
        var exception = Assert.Throws<ArgumentNullException>(() =>
            new MsiRedisConnectionProvider(null!, _msiOptionsMock.Object, _credential));

        exception.ParamName.Should().Be("logger");
    }

    [Fact]
    public void Constructor_WithNullMsiOptions_ThrowsArgumentNullException()
    {
        // Act & Assert
        var exception = Assert.Throws<ArgumentNullException>(() =>
            new MsiRedisConnectionProvider(_loggerMock.Object, null!, _credential));

        exception.ParamName.Should().Be("msiOptions");
    }

    [Fact]
    public void Constructor_WithNullCredential_ThrowsArgumentNullException()
    {
        // Act & Assert
        var exception = Assert.Throws<ArgumentNullException>(() =>
            new MsiRedisConnectionProvider(_loggerMock.Object, _msiOptionsMock.Object, null!));

        exception.ParamName.Should().Be("credential");
    }

    #endregion Constructor Tests

    #region Input Validation Tests

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

    #endregion Input Validation Tests

    #region Identity Configuration Tests

    [Fact]
    public void Constructor_WithSystemAssignedIdentity_Succeeds()
    {
        // Arrange - No client ID means system-assigned identity
        _msiOptionsMock.Setup(x => x.RedisClientId).Returns((string?)null);

        // Act
        var provider = new MsiRedisConnectionProvider(
            _loggerMock.Object,
            _msiOptionsMock.Object,
            _credential);

        // Assert
        provider.Should().NotBeNull();
    }

    [Fact]
    public void Constructor_WithUserAssignedIdentity_Succeeds()
    {
        // Arrange - Client ID provided means user-assigned identity
        var clientId = "12345678-1234-1234-1234-123456789012";
        _msiOptionsMock.Setup(x => x.RedisClientId).Returns(clientId);

        // Act
        var provider = new MsiRedisConnectionProvider(
            _loggerMock.Object,
            _msiOptionsMock.Object,
            _credential);

        // Assert
        provider.Should().NotBeNull();
    }

    #endregion Identity Configuration Tests

    #region Connection Lifecycle Tests

    [Fact]
    public void Dispose_WithNoConnections_CompletesWithoutException()
    {
        // Act & Assert - Should not throw any exception
        _provider.Dispose();
    }

    [Fact]
    public void Dispose_CanBeCalledMultipleTimes_WithoutException()
    {
        // Act & Assert - Dispose should be idempotent
        _provider.Dispose();
        _provider.Dispose(); // Should not throw ObjectDisposedException
    }

    #endregion Connection Lifecycle Tests

    public void Dispose()
    {
        _provider?.Dispose();
    }
}
