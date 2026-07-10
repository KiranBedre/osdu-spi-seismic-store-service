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

using Azure.Core;
using Microsoft.Extensions.Logging;
using Sidecar.Common.Interface;
using StackExchange.Redis;
using System;
using System.Threading.Tasks;

/// <summary>
/// Provides Redis connections with MSI (Managed Identity) authentication.
/// Uses Microsoft.Azure.StackExchangeRedis extension which AUTOMATICALLY handles
/// periodic token refresh and AUTH command execution - this is REQUIRED for Azure Redis AAD.
///
/// Without this wrapper, StackExchange.Redis only authenticates once at connection time,
/// and when the token expires, the connection dies with SocketClosed error.
/// The Microsoft.Azure.StackExchangeRedis wrapper proactively re-authenticates before expiry.
/// </summary>
public class MsiRedisConnectionProvider : RedisConnectionProviderBase
{
    private readonly TokenCredential _credential;

    public MsiRedisConnectionProvider(
        ILogger<MsiRedisConnectionProvider> logger,
        IOptionsRedisMsi msiOptions,
        TokenCredential credential)
        : base(logger)
    {
        ArgumentNullException.ThrowIfNull(msiOptions);

        _credential = credential ?? throw new ArgumentNullException(nameof(credential));

        _connectTimeout = int.TryParse(msiOptions.ConnectTimeoutMilliseconds, out int connectTimeoutMilliseconds) ? connectTimeoutMilliseconds : 10000;
        _syncTimeout = int.TryParse(msiOptions.SyncTimeoutMilliseconds, out int syncTimeoutMilliseconds) ? syncTimeoutMilliseconds : 5000;
    }

    /// <summary>
    /// Creates a Redis connection for the specified endpoint using MSI authentication.
    /// The connection automatically refreshes tokens before expiration using the
    /// Microsoft.Azure.StackExchangeRedis extension.
    /// </summary>
    public override async Task<IConnectionMultiplexer> CreateConnectionAsync(string hostname, int port)
    {
        _logger.LogInformation("Creating MSI-based Redis connection to {Host}:{Port}", hostname, port);

        try
        {
            // Create base configuration
            // Parse hostname:port or just hostname (default port will be 6380 for SSL)
            var configString = $"{hostname}:{port}";
            var config = ConfigurationOptions.Parse(configString);

            // Enable SSL/TLS for Azure Redis
            config.Ssl = true;
            config.AbortOnConnectFail = false;
            config.ConnectTimeout = _connectTimeout;
            config.SyncTimeout = _syncTimeout;

            // Configure Azure authentication with MSI using the extension methods
            // This enables automatic token refresh - CRITICAL for AAD tokens
            // Without this wrapper, tokens only authenticate once at connection time and
            // when they expire, the connection dies with SocketClosed error.
            await config.ConfigureForAzureWithTokenCredentialAsync(_credential);

            // Create connection with automatic token refresh
            var connection = await ConnectionMultiplexer.ConnectAsync(config);

            connection.ConnectionFailed += (sender, args) =>
            {
                _logger.LogError(
                    "Redis connection failed for {Host}:{Port}: {FailureType} - {Exception}",
                    hostname, port, args.FailureType, args.Exception?.Message);
            };

            connection.ConnectionRestored += (sender, args) =>
            {
                _logger.LogInformation(
                    "Redis connection restored for {Host}:{Port} with automatic token refresh",
                    hostname, port);
            };

            _logger.LogInformation(
                "MSI connection successfully established for {Host}:{Port} with automatic token refresh enabled",
                hostname, port);

            return connection;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to create MSI Redis connection for {Host}:{Port}", hostname, port);
            throw;
        }
    }
}
