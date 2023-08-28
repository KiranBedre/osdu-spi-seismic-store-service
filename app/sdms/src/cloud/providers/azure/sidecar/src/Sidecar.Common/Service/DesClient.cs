namespace Sidecar.Common.Service;

using Azure.Core;
using Azure.Security.KeyVault.Secrets;
using Newtonsoft.Json;
using Sidecar.Common.Interface;
using Sidecar.Common.Model;
using Constants = Sidecar.Common.Utility.Constants;

public class DesClient : IDesClient
{
    private readonly HttpClient _http;
    private readonly SecretClient _secretClient;
    private readonly TokenCredential _credential;
    private readonly string _desUrl;

    public DesClient(HttpClient http, SecretClient secretClient, IOptionsDataEcosystemService opts, TokenCredential credential)
    {
        _http = http;
        _secretClient = secretClient;
        _desUrl = opts.DesUrl;
        _credential = credential;
    }

    public async Task<DesResponse> GetPartitionConfiguration(string dataPartitionId, CancellationToken ct)
    {
        var appResourceIdSecret = await _secretClient.GetSecretAsync(Constants.SecretNames.APP_RESOURCE_ID, cancellationToken: ct);
        var appResourceId = appResourceIdSecret.Value.Value;
        var defaultTokenScope = new TokenRequestContext(new[] { $"{appResourceId}/.default" });

        var token = await _credential.GetTokenAsync(defaultTokenScope, ct);

        using var requestMessage = new HttpRequestMessage(HttpMethod.Get, $"{_desUrl}/{dataPartitionId}");
        requestMessage.Headers.Add("Accept", "application/json");
        requestMessage.Headers.Add("Content-Type", "application/json");
        requestMessage.Headers.Authorization = new("Bearer", token.Token);

        var response = await _http.SendAsync(requestMessage, ct);
        response.EnsureSuccessStatusCode();
        string responseBody = await response.Content.ReadAsStringAsync(ct);
        return JsonConvert.DeserializeObject<DesResponse>(responseBody);
    }
}
