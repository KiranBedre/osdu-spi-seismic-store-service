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
    IOptionsStorageAccount storageAccountOptions,
    IDesClient desClient,
    SecretClient secretClient)
    : IAzureStorageResourceResolver
{
    private readonly IOptionsAzureResourceScope _azureResourceScope = azureResourceScope ?? throw new ArgumentNullException(nameof(azureResourceScope));
    private readonly IOptionsStorageAccount _storageAccountOptions = storageAccountOptions ?? throw new ArgumentNullException(nameof(storageAccountOptions));
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
        if (!string.IsNullOrWhiteSpace(_storageAccountOptions.StorageAccountName))
        {
            return _storageAccountOptions.StorageAccountName;
        }

        if (!string.IsNullOrWhiteSpace(_storageAccountOptions.StorageAccountConnectionString))
        {
            foreach (var segment in _storageAccountOptions.StorageAccountConnectionString.Split(';', StringSplitOptions.RemoveEmptyEntries))
            {
                if (segment.StartsWith(Constants.StorageResource.ACCOUNT_NAME_KEY, StringComparison.OrdinalIgnoreCase))
                {
                    return segment[Constants.StorageResource.ACCOUNT_NAME_KEY.Length..];
                }
            }
        }

        var desConfig = await _desClient.GetPartitionConfigurationAsync(dataPartitionId, ct);
        return await desConfig.StorageAccountName.GetActualValueAsync(_secretClient, ct);
    }

    /// <inheritdoc/>
    public string ResolveResourceGroupName(string dataPartitionId)
    {
        var configuredResourceGroup = _azureResourceScope.AzureResourceGroup;

        if (string.IsNullOrWhiteSpace(configuredResourceGroup))
        {
            throw new InvalidOperationException("AZURE_RESOURCE_GROUP must be configured for management-plane operations.");
        }

        if (!configuredResourceGroup.StartsWith(Constants.StorageResource.COMPUTE_RG_PREFIX, StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException(
                $"AZURE_RESOURCE_GROUP '{configuredResourceGroup}' must start with '{Constants.StorageResource.COMPUTE_RG_PREFIX}' for PITR resource group derivation.");
        }

        // Remaining shape expected: <stamp>-<suffix>
        var remainder = configuredResourceGroup[Constants.StorageResource.COMPUTE_RG_PREFIX.Length..];
        var lastDashIndex = remainder.LastIndexOf('-');
        if (lastDashIndex <= 0 || lastDashIndex >= remainder.Length - 1)
        {
            throw new InvalidOperationException(
                $"AZURE_RESOURCE_GROUP '{configuredResourceGroup}' is not in expected format 'Compute-rg-<stamp>-<suffix>'.");
        }

        var stamp = remainder[..lastDashIndex];
        var suffix = remainder[(lastDashIndex + 1)..];
        var tenant = dataPartitionId.Trim();

        return $"DataPartition-rg-{stamp}-{tenant}-{suffix}";
    }
}
