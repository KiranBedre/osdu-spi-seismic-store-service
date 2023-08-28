namespace Sidecar.Common.Interface;


public interface ICosmosClientFactory
{
    Task<string> GetCosmosConnectionString(string dataPartitionId, CancellationToken ct = default);
}
