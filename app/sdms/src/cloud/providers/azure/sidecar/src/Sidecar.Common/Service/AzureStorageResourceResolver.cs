// ============================================================================
// Copyright 2026, Microsoft
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

using Azure.Security.KeyVault.Secrets;
using Sidecar.Common.Interface;
using Sidecar.Common.Utility;

/// <summary>
/// Resolves the Azure management-plane resource identity (subscription, resource group,
/// storage account) from sidecar configuration and DES partition configuration.
/// </summary>
public class AzureStorageResourceResolver(
    IOptionsAzureResourceScope azureResourceScope,
    IDesClient desClient,
    SecretClient secretClient)
    : IAzureStorageResourceResolver
{
    private readonly IOptionsAzureResourceScope _azureResourceScope = azureResourceScope ?? throw new ArgumentNullException(nameof(azureResourceScope));
    private readonly IDesClient _desClient = desClient ?? throw new ArgumentNullException(nameof(desClient));
    private readonly SecretClient _secretClient = secretClient ?? throw new ArgumentNullException(nameof(secretClient));

    /// <inheritdoc/>
    public string SubscriptionId =>
        string.IsNullOrWhiteSpace(_azureResourceScope.AzureSubscriptionId)
            ? throw new InvalidOperationException("AZURE_SUBSCRIPTION_ID must be configured for management-plane operations.")
            : _azureResourceScope.AzureSubscriptionId;

    /// <inheritdoc/>
    public async Task<string> ResolveStorageAccountNameAsync(string dataPartitionId, CancellationToken ct)
    {
        var desConfig = await _desClient.GetPartitionConfigurationAsync(dataPartitionId, ct);
        var storageAccountName = await desConfig.StorageAccountName.GetActualValueAsync(_secretClient, ct);
        if (string.IsNullOrWhiteSpace(storageAccountName))
        {
            throw new InvalidOperationException(
                "Partition configuration must define storage-account-name for management-plane operations.");
        }

        return storageAccountName;
    }

    /// <inheritdoc/>
    public string ResolveResourceGroupName(string dataPartitionId)
    {
        var configuredResourceGroup = _azureResourceScope.AzureResourceGroup;

        if (string.IsNullOrWhiteSpace(configuredResourceGroup))
        {
            throw new InvalidOperationException("AZURE_RESOURCE_GROUP must be configured for management-plane operations.");
        }

        return configuredResourceGroup;
    }
}
