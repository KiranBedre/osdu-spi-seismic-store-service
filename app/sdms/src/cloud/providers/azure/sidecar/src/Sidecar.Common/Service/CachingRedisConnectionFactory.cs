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

public class CachingRedisConnectionFactory : IRedisConnectionFactory
{
    private readonly Lazy<IConnectionMultiplexer> _locksRedis;
    private readonly Lazy<IConnectionMultiplexer> _queueRedis;
    
    public CachingRedisConnectionFactory(IRedisConnectionFactory source)
    {
        _locksRedis = new(source.GetRedisForLocks);
        _queueRedis = new(source.GetRedisForQueue);
    }

    public IConnectionMultiplexer GetRedisForQueue()
    {
        return _locksRedis.Value;
    }

    public IConnectionMultiplexer GetRedisForLocks()
    {
        return _queueRedis.Value;
    }

}
