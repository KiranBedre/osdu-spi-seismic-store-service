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
using System.Net;

public class RedisConnectionFactory : IRedisConnectionFactory
{
    private readonly IOptionsLocksRedis _locksOpts;
    private readonly IOptionsQueueRedis _queueOpts;
    
    public RedisConnectionFactory(
        IOptionsLocksRedis locksOpts,
        IOptionsQueueRedis queueOpts)
    {
        _locksOpts = locksOpts;
        _queueOpts = queueOpts;
    }

    public IConnectionMultiplexer GetRedisForQueue()
    {
        return ConnectionMultiplexer.Connect(
            new ConfigurationOptions
            {
                EndPoints = new()
                {
                    new DnsEndPoint(
                        _locksOpts.RedisLocksHostname,
                        Convert.ToInt32(_locksOpts.RedisLocksPort))
                },
                Password = _locksOpts.RedisLocksPassword,
            });
    }

    public IConnectionMultiplexer GetRedisForLocks()
    {
        return ConnectionMultiplexer.Connect(
            new ConfigurationOptions
            {
                EndPoints = new () { new DnsEndPoint(
                    _queueOpts.RedisQueueHostname, 
                    Convert.ToInt32(_queueOpts.RedisQueuePort)) },
                Password = _queueOpts.RedisQueuePassword,
            });
    }

}
