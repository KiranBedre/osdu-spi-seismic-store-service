namespace Sidecar.Common.Model;

using Newtonsoft.Json;

public class DesResponse
{
    [JsonProperty("sdms-storage-account-name")]
    public DesConfigVariable StorageAccountName { get; set; } = new DesConfigVariable();

    [JsonProperty("cosmos-endpoint")]
    public DesConfigVariable CosmosEndpoint { get; set; } = new DesConfigVariable();

    [JsonProperty("cosmos-primary-key")]
    public DesConfigVariable CosmosPrimaryKey { get; set; } = new DesConfigVariable();
}

