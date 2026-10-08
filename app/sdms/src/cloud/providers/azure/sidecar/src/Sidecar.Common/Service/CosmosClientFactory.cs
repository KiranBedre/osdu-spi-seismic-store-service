// ============================================================================
// Copyright 2017-2023, Microsoft
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
// ============================================================================

namespace Sidecar.Common.Service;

using Sidecar.Common.Interface;

using Azure.Security.KeyVault.Secrets;

public class CosmosClientFactory(
    IDesClient desClient,
    SecretClient secretClient) : ICosmosClientFactory
{
    private readonly IDesClient _desClient = desClient;
    private readonly SecretClient _secretClient = secretClient;

    public async Task<string> GetCosmosConnectionStringAsync(string dataPartitionId, CancellationToken ct = default)
    {
        var desConfig = await _desClient.GetPartitionConfigurationAsync(dataPartitionId, ct);
        var endpoint = await desConfig.CosmosEndpoint.GetActualValueAsync(_secretClient, ct);
        var primaryKey = await desConfig.CosmosPrimaryKey.GetActualValueAsync(_secretClient, ct);

        return $"AccountEndpoint={endpoint};AccountKey={primaryKey};";
    }
}
