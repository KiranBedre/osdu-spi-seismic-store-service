namespace Sidecar.Common.Interface;

public interface IRedisConnectionFactory
{
    IRedisHandler GetRedisForQueue();
    IRedisHandler GetRedisForLocks();
}
