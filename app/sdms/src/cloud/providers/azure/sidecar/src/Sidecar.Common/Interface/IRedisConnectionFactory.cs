namespace Sidecar.Common.Interface;

using StackExchange.Redis;

public interface IRedisConnectionFactory
{
    IConnectionMultiplexer GetRedisForQueue();
    IConnectionMultiplexer GetRedisForLocks();
}
