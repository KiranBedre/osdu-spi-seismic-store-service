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

using Interface;
using Microsoft.Extensions.Logging;

public class RedisLocksConnectionFactory : IRedisConnectionFactory<RedisLocksConnectionFactory>
{
    private readonly ILoggerFactory _loggerFactory;
    private readonly IRedisMultiplexerFactory _multiplexerFactory;
    private readonly IOptionsLocksRedis _locksOpts;

    public RedisLocksConnectionFactory(
        ILoggerFactory loggerFactory,
        IRedisMultiplexerFactory multiplexerFactory,
        IOptionsLocksRedis locksOpts)
    {
        _loggerFactory = loggerFactory;
        _multiplexerFactory = multiplexerFactory;
        _locksOpts = locksOpts;
    }

    public IRedisHandler GetRedis() => FromConfig(
            _locksOpts.RedisLocksHostname,
            _locksOpts.RedisLocksPort);

    private IRedisHandler FromConfig(string hostname, string port)
    {
        var connection = _multiplexerFactory.GetConnectionAsync(hostname, Convert.ToInt32(port)).GetAwaiter().GetResult();
        return new RedisHandler(_loggerFactory.CreateLogger<RedisHandler>(), connection);
    }
}
