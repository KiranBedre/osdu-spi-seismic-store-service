namespace Sidecar.Common.Service;

using Sidecar.Common.Interface;
using Sidecar.Common.Model;

/// <summary>
/// When running locally, it's hard to connect to the actual DES service.
/// This class lets us stub the DES client and instead of calling the DES service,
/// take the config from the options.
/// </summary>
public class DesClientFromEnv : IDesClient
{
    private readonly IOptions _opts;

    public DesClientFromEnv(IOptions opts)
    {
        _opts = opts;
    }

    public Task<DesResponse> GetPartitionConfiguration(string dataPartitionId, CancellationToken ct = default)
    {
        // ignore dataPartitionId, always inject the values from the options

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
