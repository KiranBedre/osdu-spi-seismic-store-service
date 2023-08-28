namespace Sidecar.Common.Service;

using StackExchange.Redis;

public interface IRedisConnectionFactory
{
    IConnectionMultiplexer GetRedisForQueue();
    IConnectionMultiplexer GetRedisForLocks();
}
