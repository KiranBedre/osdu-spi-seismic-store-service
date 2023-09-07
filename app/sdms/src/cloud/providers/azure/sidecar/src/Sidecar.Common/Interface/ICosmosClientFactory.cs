namespace Sidecar.Common.Interface;


public interface ICosmosClientFactory
{
    Task<string> GetCosmosConnectionStringAsync(string dataPartitionId, CancellationToken ct = default);
}
