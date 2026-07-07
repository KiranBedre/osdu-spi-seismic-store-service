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
using Sidecar.Common.Interface;

/// <summary>
/// STUB — Cosmos metadata restore service.
///
/// Responsibility: restore the Cosmos metadata document to the target point-in-time.
/// Storage-location discovery (gcsurl, blob paths) is NOT handled here — it is a storage
/// concern owned by IDatasetStorageInfoProvider and orchestrated by the executor.
///
/// FinalizeRestoreAsync
/// Restores the Cosmos metadata document to the target point-in-time.
/// Called after blob restore completes, so storage is ready when metadata becomes active.
/// This is a stub — implementation requires a decided archival/snapshot backend.
///
/// BLOCKER: Implementation requires a decided archival/snapshot backend.
/// No such mechanism exists in the repo today. Options under evaluation:
///   - Azure Cosmos DB continuous backup + point-in-time restore
///   - Custom metadata snapshot written to Azure Storage at dataset creation / tier change
///   - Cosmos DB change-feed replay from a snapshot stored in Azure Storage
/// </summary>
public class MetadataRestoreService(
    ILogger<MetadataRestoreService> logger) : IMetadataRestoreService
{
    private readonly ILogger<MetadataRestoreService> _logger = logger ?? throw new ArgumentNullException(nameof(logger));

    /// <inheritdoc/>
    public Task FinalizeRestoreAsync(string sdPath, string restorePointInTime, string operationId, CancellationToken ct)
    {
        _logger.LogError(
            "MetadataRestoreService.FinalizeRestoreAsync is not yet implemented. " +
            "Archival backend has not been decided or built yet. " +
            "OperationId: {OperationId}, SdPath: {SdPath}, RestorePoint: {RestorePointInTime}",
            operationId, sdPath, restorePointInTime);

        throw new NotImplementedException(
            "Metadata restore finalization is not yet implemented. " +
            "The archival/snapshot backend has not been decided or built.");
    }
}
