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
using StackExchange.Redis;
using System;
using System.Net;
using System.Threading.Tasks;

/// <summary>
/// Provides Redis connections with password-based authentication.
/// Legacy authentication method - to be phased out in favor of MSI.
/// </summary>
public class PasswordRedisConnectionProvider : RedisConnectionProviderBase
{
    private readonly IOptionsLocksRedis _locksOptions;
    private readonly IOptionsQueueRedis _queueOptions;

    public PasswordRedisConnectionProvider(
        ILogger<PasswordRedisConnectionProvider> logger,
        IOptionsLocksRedis locksOptions,
        IOptionsQueueRedis queueOptions)
        : base(logger)
    {
        _locksOptions = locksOptions ?? throw new ArgumentNullException(nameof(locksOptions));
        _queueOptions = queueOptions ?? throw new ArgumentNullException(nameof(queueOptions));

        // both locks options and queue options will have the same timeout values
        _connectTimeout = int.TryParse(_locksOptions.ConnectTimeoutMilliseconds, out int connectTimeoutMilliseconds) ? connectTimeoutMilliseconds : 10000;
        _syncTimeout = int.TryParse(_locksOptions.SyncTimeoutMilliseconds, out int syncTimeoutMilliseconds) ? syncTimeoutMilliseconds : 5000;
    }

    /// <summary>
    /// Gets or creates a Redis connection for the specified endpoint using password authentication.
    /// </summary>
    public override Task<IConnectionMultiplexer> CreateConnectionAsync(string hostname, int port)
    {
        _logger.LogInformation("Creating password-based Redis connection to {Host}:{Port}", hostname, port);

        var password = GetPasswordForHost(hostname, port);

        var config = new ConfigurationOptions
        {
            EndPoints = { new DnsEndPoint(hostname, port) },
            Password = password,
            Ssl = true,
            AbortOnConnectFail = false,
            ConnectTimeout = _connectTimeout,
            SyncTimeout = _syncTimeout
        };

        IConnectionMultiplexer connection = ConnectionMultiplexer.Connect(config);

        connection.ConnectionFailed += (sender, args) =>
        {
            _logger.LogError(
                "Redis connection failed for {Host}:{Port}: {FailureType} - {Exception}",
                hostname, port, args.FailureType, args.Exception?.Message);
        };

        connection.ConnectionRestored += (sender, args) =>
        {
            _logger.LogInformation("Redis connection restored for {Host}:{Port}", hostname, port);
        };

        return Task.FromResult(connection);
    }

    private string GetPasswordForHost(string hostname, int port)
    {
        // Check if this matches locks Redis
        if (hostname == _locksOptions.RedisLocksHostname &&
            int.TryParse(_locksOptions.RedisLocksPort, out var locksPort) &&
            port == locksPort)
        {
            return _locksOptions.RedisLocksPassword;
        }

        // Check if this matches queue Redis
        if (hostname == _queueOptions.RedisQueueHostname &&
            int.TryParse(_queueOptions.RedisQueuePort, out var queuePort) &&
            port == queuePort)
        {
            return _queueOptions.RedisQueuePassword;
        }

        throw new InvalidOperationException($"No password configuration found for Redis host {hostname}:{port}");
    }
}
