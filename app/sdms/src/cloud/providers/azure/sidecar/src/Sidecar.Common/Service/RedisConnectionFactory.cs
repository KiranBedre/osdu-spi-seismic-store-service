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

using StackExchange.Redis;
using Interface;
using Microsoft.Extensions.Logging;
using System.Net;

public class RedisConnectionFactory : IRedisConnectionFactory
{
    private readonly ILoggerFactory _loggerFactory;
    private readonly IOptionsLocksRedis _locksOpts;
    private readonly IOptionsQueueRedis _queueOpts;

    public RedisConnectionFactory(
        ILoggerFactory loggerFactory,
        IOptionsLocksRedis locksOpts,
        IOptionsQueueRedis queueOpts)
    {
        _loggerFactory = loggerFactory;
        _locksOpts = locksOpts;
        _queueOpts = queueOpts;
    }

    public IRedisHandler GetRedisForQueue()
    {
        return FromConfig(
            _locksOpts.RedisLocksHostname,
            _locksOpts.RedisLocksPort,
            _locksOpts.RedisLocksPassword);
    }

    public IRedisHandler GetRedisForLocks()
    {
        return FromConfig(
            _queueOpts.RedisQueueHostname,
            _queueOpts.RedisQueuePort,
            _queueOpts.RedisQueuePassword);
    }

    private IRedisHandler FromConfig(string hostname, string port, string password)
    {
        var connection = ConnectionMultiplexer.Connect(
            new ConfigurationOptions
            {
                EndPoints = new() { new DnsEndPoint(
                    hostname,
                    Convert.ToInt32(port)) },
                Password = password,
            });
        return new RedisHandler(_loggerFactory.CreateLogger<RedisHandler>(), connection);
    }
}
