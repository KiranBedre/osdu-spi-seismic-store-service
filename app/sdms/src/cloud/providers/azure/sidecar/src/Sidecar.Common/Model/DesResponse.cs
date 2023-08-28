namespace Sidecar.Common.Model;

using System.Text.Json.Serialization;

public class DesResponse
{
    [JsonPropertyName("sdms-storage-account-name")]
    public DesConfigVariable StorageAccountName { get; set; }
    
    [JsonPropertyName("cosmos-endpoint")]
    public DesConfigVariable CosmosEndpoint { get; set; }
    
    [JsonPropertyName("cosmos-primary-key")]
    public DesConfigVariable CosmosPrimaryKey { get; set; }
}


