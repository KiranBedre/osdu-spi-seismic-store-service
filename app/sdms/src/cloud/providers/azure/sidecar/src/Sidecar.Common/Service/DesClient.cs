namespace Sidecar.Common.Service;

using Azure.Core;
using Newtonsoft.Json;
using Sidecar.Common.Interface;
using Sidecar.Common.Model;

/// <summary>
/// Copied from:
/// https://community.opengroup.org/osdu/platform/domain-data-mgmt-services/seismic/seismic-dms-suite/seismic-store-service/-/blob/master/app/sdms/src/cloud/providers/azure/dataecosystem.ts?ref_type=heads
/// </summary>
public class DesClient : IDesClient
{
    private readonly HttpClient _http;
    private readonly IOptionsDataEcosystemService _opts;
    private readonly TokenCredential _credential;

    public DesClient(HttpClient http, IOptionsDataEcosystemService opts, TokenCredential credential)
    {
        _http = http;
        _opts = opts;
        _credential = credential;
    }

    public async Task<DesResponse> GetPartitionConfiguration(string dataPartitionId, CancellationToken ct)
    {
        var appResourceId = _opts.AppResourceId;
        var defaultTokenScope = new TokenRequestContext(new[] { $"{appResourceId}/.default" });

        var token = await _credential.GetTokenAsync(defaultTokenScope, ct);

        using var requestMessage = new HttpRequestMessage(HttpMethod.Get, $"{_opts.DesUrl}/{dataPartitionId}");
        requestMessage.Headers.Add("Accept", "application/json");
        requestMessage.Headers.Add("Content-Type", "application/json");
        requestMessage.Headers.Authorization = new("Bearer", token.Token);

        var response = await _http.SendAsync(requestMessage, ct);
        response.EnsureSuccessStatusCode();
        string responseBody = await response.Content.ReadAsStringAsync(ct);
        return JsonConvert.DeserializeObject<DesResponse>(responseBody);
    }
}
