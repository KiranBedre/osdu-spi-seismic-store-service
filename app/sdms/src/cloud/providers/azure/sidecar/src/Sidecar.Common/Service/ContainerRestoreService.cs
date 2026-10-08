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

using Microsoft.Extensions.Logging;
using Sidecar.Common.Exceptions;
using Sidecar.Common.Interface;
using Sidecar.Common.Model;
using Sidecar.Common.Utility;

/// <summary>
/// Restores a soft-deleted dataset container (container soft delete) before blob PITR when the
/// subproject access policy is 'dataset'. Idempotent: a re-run whose container already exists is
/// a no-op.
/// </summary>
public class ContainerRestoreService(
    ILogger<ContainerRestoreService> logger,
    IBlobClientFactory blobClientFactory)
    : IContainerRestoreService
{
    private readonly ILogger<ContainerRestoreService> _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    private readonly IBlobClientFactory _blobClientFactory = blobClientFactory ?? throw new ArgumentNullException(nameof(blobClientFactory));

    /// <inheritdoc/>
    public async Task<bool> EnsureContainerAvailableAsync(
        string dataPartitionId,
        DatasetStorageInfo storageInfo,
        string operationId,
        CancellationToken ct = default)
    {
        // A dataset that is still active (not deleted) has an intact container, so there is
        // nothing to undelete. Container deletion only happens when the dataset itself is deleted.
        if (!storageInfo.IsDeleted)
        {
            _logger.LogInformation(
                "Dataset is not deleted; skipping container undelete - Container: {Container}, OperationId: {OperationId}",
                storageInfo.ContainerName, operationId);
            return false;
        }

        // Only the 'dataset' access policy gives each dataset a dedicated container that is
        // deleted together with the dataset. Under 'uniform' the container is shared across
        // datasets and is not removed by a single-dataset delete, so there is nothing to undelete.
        if (!string.Equals(storageInfo.AccessPolicy, Constants.AccessPolicy.DATASET, StringComparison.OrdinalIgnoreCase))
        {
            _logger.LogInformation(
                "Access policy is '{AccessPolicy}', skipping container undelete - Container: {Container}, OperationId: {OperationId}",
                storageInfo.AccessPolicy, storageInfo.ContainerName, operationId);
            return false;
        }

        if (string.IsNullOrWhiteSpace(storageInfo.ContainerName))
        {
            _logger.LogWarning(
                "Container name is empty; cannot ensure container availability - OperationId: {OperationId}",
                operationId);
            return false;
        }

        var blobClient = await _blobClientFactory.GetBlobClientAsync(dataPartitionId, ct);

        if (await blobClient.ContainerExistsAsync(storageInfo.ContainerName, ct))
        {
            _logger.LogInformation(
                "Container already exists; no undelete required - Container: {Container}, OperationId: {OperationId}",
                storageInfo.ContainerName, operationId);
            return true;
        }

        _logger.LogInformation(
            "Container missing under dataset access policy; attempting undelete - Container: {Container}, OperationId: {OperationId}",
            storageInfo.ContainerName, operationId);

        var undeleted = await blobClient.TryUndeleteContainerAsync(storageInfo.ContainerName, ct);
        if (!undeleted)
        {
            throw new InvalidOperationException(
                $"Container '{storageInfo.ContainerName}' is missing and no soft-deleted copy was found to restore " +
                $"(it may be outside the container soft-delete retention window). OperationId: {operationId}");
        }

        try
        {
            await WaitForContainerVisibleAsync(blobClient, storageInfo.ContainerName, operationId, ct);
        }
        catch (Exception ex)
        {
            throw new ContainerRestoreMutationException(
                $"Container '{storageInfo.ContainerName}' was undeleted but did not become available.",
                ex);
        }

        _logger.LogInformation(
            "Container restored and visible - Container: {Container}, OperationId: {OperationId}",
            storageInfo.ContainerName, operationId);
        return true;
    }

    /// <summary>
    /// Polls until the just-undeleted container is observable, to avoid a read-after-undelete
    /// race before blob restore begins.
    /// </summary>
    private async Task WaitForContainerVisibleAsync(
        IBlobClient blobClient,
        string containerName,
        string operationId,
        CancellationToken ct)
    {
        for (var attempt = 1; attempt <= Constants.RestoreConfiguration.CONTAINER_VISIBILITY_MAX_ATTEMPTS; attempt++)
        {
            if (await blobClient.ContainerExistsAsync(containerName, ct))
            {
                return;
            }

            _logger.LogInformation(
                "Waiting for undeleted container to become visible - Container: {Container}, Attempt: {Attempt}/{MaxAttempts}, OperationId: {OperationId}",
                containerName, attempt, Constants.RestoreConfiguration.CONTAINER_VISIBILITY_MAX_ATTEMPTS, operationId);

            await Task.Delay(
                TimeSpan.FromSeconds(Constants.RestoreConfiguration.CONTAINER_VISIBILITY_POLL_INTERVAL_SECONDS), ct);
        }

        throw new InvalidOperationException(
            $"Container '{containerName}' was undeleted but did not become visible within the expected window. " +
            $"OperationId: {operationId}");
    }
}
