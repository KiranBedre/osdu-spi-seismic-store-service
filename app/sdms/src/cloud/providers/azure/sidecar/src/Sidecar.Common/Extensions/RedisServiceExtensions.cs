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

namespace Sidecar.Common.Extensions;

using Azure.Core;
using Azure.Identity;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Sidecar.Common.Interface;
using Sidecar.Common.Service;

/// <summary>
/// Extension methods for configuring Redis connection services.
/// </summary>
public static class RedisServiceExtensions
{
    /// <summary>
    /// Adds Redis connection factory services with automatic authentication strategy selection.
    /// Registers MSI-based factory if MSI is enabled, otherwise registers password-based factory.
    ///
    /// Note: Token refresh is now handled automatically by Microsoft.Azure.StackExchangeRedis,
    /// so no background refresh service is needed.
    /// </summary>
    public static IServiceCollection AddRedisConnectionFactory(
        this IServiceCollection services,
        IOptionsRedisMsi msiOptions,
        ILogger logger)
    {
        var raw = msiOptions?.RedisMsiEnabled;
        var useMsi = bool.TryParse(raw, out var parsed) && parsed;

        if (msiOptions is not null && raw is not null && !bool.TryParse(raw, out _))
        {
            logger.LogWarning("Invalid RedisMsiEnabled value '{Value}'; falling back to password authentication", raw);
        }

        if (useMsi)
        {
            TokenCredential credential;

            if (string.IsNullOrWhiteSpace(msiOptions?.RedisClientId))
            {
                // System-assigned managed identity
                logger.LogInformation("Configuring system-assigned managed identity for Redis");
                credential = new DefaultAzureCredential();
            }
            else
            {
                // User-assigned managed identity - create a credential with the client ID
                logger.LogInformation("Configuring user-assigned managed identity ({ClientId}) for Redis", msiOptions.RedisClientId);
                credential = new ManagedIdentityCredential(msiOptions.RedisClientId);
            }

            // register credential for dependency injection
            services
                .AddSingleton<TokenCredential>(_ => credential)
                .AddSingleton<IRedisConnectionProvider, MsiRedisConnectionProvider>();
        }
        else
        {
            services.AddSingleton<IRedisConnectionProvider, PasswordRedisConnectionProvider>();
        }

        services.AddSingleton<IRedisMultiplexerFactory, RedisMultiplexerFactory>();

        return services;
    }
}
