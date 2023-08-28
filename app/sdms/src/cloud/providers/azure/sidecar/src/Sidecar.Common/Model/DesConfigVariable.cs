namespace Sidecar.Common.Model;

using Azure.Security.KeyVault.Secrets;
using System.Text.Json.Serialization;

public class DesConfigVariable
{
    /// <summary>
    /// If <see cref="Sensitive"/> is true, this is the name of a secret in the KeyVault where to find the value.
    /// If <see cref="Sensitive"/> is false, this is the value itself.
    /// </summary>
    [JsonPropertyName("value")]
    public string Value { get; set; }
    
    /// <summary>
    /// Hit on how to interpret the <see cref="Value"/>.
    /// </summary>
    [JsonPropertyName("sensitive")]
    public bool Sensitive { get; set; }

    public async Task<string> GetActualValue(SecretClient secretClient, CancellationToken ct)
    {
        if (!Sensitive)
        {
            return Value;
        }

        var secretResponse = await secretClient.GetSecretAsync(Value, cancellationToken: ct);

        if (!secretResponse.HasValue)
        {
            throw new($"Not found the secret {Value}");
        }

        return secretResponse.Value.Value;
    }
}


