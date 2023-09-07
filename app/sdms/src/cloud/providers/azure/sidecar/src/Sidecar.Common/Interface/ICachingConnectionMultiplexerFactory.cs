namespace Sidecar.Common.Interface;

using StackExchange.Redis;

public interface ICachingConnectionMultiplexerFactory
{
    IConnectionMultiplexer GetRedisConnection(string hostname, int port, string password);
}
