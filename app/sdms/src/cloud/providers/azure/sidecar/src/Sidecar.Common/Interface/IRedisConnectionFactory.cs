namespace Sidecar.Common.Interface;

public interface IRedisConnectionFactory<T> where T : class
{
    IRedisHandler GetRedis();
}
