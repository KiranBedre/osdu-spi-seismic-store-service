namespace Sidecar.Common.Model;

using System.Text.Json.Serialization;

public class DesResponse
{
    [JsonPropertyName("sdms-storage-account-name")]
    public DesConfigVariable StorageAccountName { get; set; } = new DesConfigVariable();

    [JsonPropertyName("cosmos-endpoint")]
    public DesConfigVariable CosmosEndpoint { get; set; } = new DesConfigVariable();

    [JsonPropertyName("cosmos-primary-key")]
    public DesConfigVariable CosmosPrimaryKey { get; set; } = new DesConfigVariable();
}

