namespace Sidecar.Common.Service;

using Sidecar.Common.Interface;
using Sidecar.Common.Model;

public class DesClientFromEnv : IDesClient
{
    private readonly IOptions _opts;

    public DesClientFromEnv(IOptions opts)
    {
        _opts = opts;
    }

    public Task<DesResponse> GetPartitionConfiguration(string dataPartitionId, CancellationToken ct = default)
    {
        return Task.FromResult(new DesResponse
        {
            StorageAccountName = new()
            {
                Sensitive = false,
                Value = _opts.StorageAccountName, 
            },
            CosmosEndpoint = new()
            {
                Sensitive = false,
                Value = _opts.CosmosEndpoint,
            },
            CosmosPrimaryKey = new()
            {
                Sensitive = false,
                Value = _opts.CosmosKey,
            },
        });
    }
}
