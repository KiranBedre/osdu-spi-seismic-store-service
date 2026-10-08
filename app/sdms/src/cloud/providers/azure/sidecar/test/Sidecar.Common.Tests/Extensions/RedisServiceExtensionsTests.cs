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

namespace Sidecar.Common.Tests.Extensions;

using Microsoft.Extensions.DependencyInjection;
using Sidecar.Common.Extensions;

public class RedisServiceExtensionsTests
{
    [Fact]
    public void AddRedisConnectionFactory_WithMsiEnabled_RegistersMsiServices()
    {
        // Arrange
        var services = new ServiceCollection();
        var msiOptions = new Mock<IOptionsRedisMsi>();
        msiOptions.Setup(x => x.RedisMsiEnabled).Returns("true");

        // Add required dependencies
        services.AddSingleton<ILogger<MsiRedisConnectionProvider>>(Mock.Of<ILogger<MsiRedisConnectionProvider>>());
        services.AddSingleton(msiOptions.Object);
        services.AddSingleton<Azure.Core.TokenCredential>(new Azure.Identity.DefaultAzureCredential());

        // Act
        services.AddRedisConnectionFactory(msiOptions.Object, Mock.Of<ILogger>());

        // Assert
        var serviceProvider = services.BuildServiceProvider();

        // Should register interface
        var provider = serviceProvider.GetService<IRedisConnectionProvider>();
        provider.Should().NotBeNull();
        provider.Should().BeOfType<MsiRedisConnectionProvider>();

        var factory = serviceProvider.GetService<IRedisMultiplexerFactory>();
        factory.Should().NotBeNull();
        factory.Should().BeOfType<RedisMultiplexerFactory>();
    }

    [Fact]
    public void AddRedisConnectionFactory_WithMsiDisabled_RegistersPasswordServices()
    {
        // Arrange
        var services = new ServiceCollection();
        var msiOptions = new Mock<IOptionsRedisMsi>();
        msiOptions.Setup(x => x.RedisMsiEnabled).Returns("false");

        // Need to register logger and options that PasswordRedisConnectionProvider depends on
        services.AddSingleton<ILogger<PasswordRedisConnectionProvider>>(Mock.Of<ILogger<PasswordRedisConnectionProvider>>());
        var locksOptions = new Mock<IOptionsLocksRedis>();
        var queueOptions = new Mock<IOptionsQueueRedis>();
        services.AddSingleton(locksOptions.Object);
        services.AddSingleton(queueOptions.Object);

        // Act
        services.AddRedisConnectionFactory(msiOptions.Object, Mock.Of<ILogger>());

        // Assert
        var serviceProvider = services.BuildServiceProvider();

        // Should register interface
        var provider = serviceProvider.GetService<IRedisConnectionProvider>();
        provider.Should().NotBeNull();
        provider.Should().BeOfType<PasswordRedisConnectionProvider>();

        var factory = serviceProvider.GetService<IRedisMultiplexerFactory>();
        factory.Should().NotBeNull();
        factory.Should().BeOfType<RedisMultiplexerFactory>();
    }

    [Fact]
    public void AddRedisConnectionFactory_WithNullOptions_RegistersPasswordServices()
    {
        // Arrange
        var services = new ServiceCollection();

        // Need to register logger and options that PasswordRedisConnectionProvider depends on
        services.AddSingleton<ILogger<PasswordRedisConnectionProvider>>(Mock.Of<ILogger<PasswordRedisConnectionProvider>>());
        var locksOptions = new Mock<IOptionsLocksRedis>();
        var queueOptions = new Mock<IOptionsQueueRedis>();
        services.AddSingleton(locksOptions.Object);
        services.AddSingleton(queueOptions.Object);

        // Act
        services.AddRedisConnectionFactory(null!, Mock.Of<ILogger>());

        // Assert
        var serviceProvider = services.BuildServiceProvider();

        var factory = serviceProvider.GetService<IRedisMultiplexerFactory>();
        factory.Should().NotBeNull();
        factory.Should().BeOfType<RedisMultiplexerFactory>();
    }

    [Fact]
    public void AddRedisConnectionFactory_WithInvalidMsiEnabled_RegistersPasswordServices()
    {
        // Arrange
        var services = new ServiceCollection();
        var msiOptions = new Mock<IOptionsRedisMsi>();
        msiOptions.Setup(x => x.RedisMsiEnabled).Returns("invalid-bool");

        // Need to register logger and options that PasswordRedisConnectionProvider depends on
        services.AddSingleton<ILogger<PasswordRedisConnectionProvider>>(Mock.Of<ILogger<PasswordRedisConnectionProvider>>());
        var locksOptions = new Mock<IOptionsLocksRedis>();
        var queueOptions = new Mock<IOptionsQueueRedis>();
        services.AddSingleton(locksOptions.Object);
        services.AddSingleton(queueOptions.Object);

        // Act
        services.AddRedisConnectionFactory(msiOptions.Object, Mock.Of<ILogger>());

        // Assert
        var serviceProvider = services.BuildServiceProvider();

        var factory = serviceProvider.GetService<IRedisMultiplexerFactory>();
        factory.Should().NotBeNull();
        factory.Should().BeOfType<RedisMultiplexerFactory>();
    }

    [Fact]
    public void AddRedisConnectionFactory_RegistersDefaultAzureCredential()
    {
        // Arrange
        var services = new ServiceCollection();
        var msiOptions = new Mock<IOptionsRedisMsi>();
        msiOptions.Setup(x => x.RedisMsiEnabled).Returns("true");

        // Act
        services.AddRedisConnectionFactory(msiOptions.Object, Mock.Of<ILogger>());

        // Assert
        var serviceProvider = services.BuildServiceProvider();

        // Should register DefaultAzureCredential
        var credential = serviceProvider.GetService<Azure.Core.TokenCredential>();
        credential.Should().NotBeNull();
        credential.Should().BeOfType<Azure.Identity.DefaultAzureCredential>();
    }
}
