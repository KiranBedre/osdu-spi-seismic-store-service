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

namespace Sidecar.RestoreRunner;

using Microsoft.Extensions.Logging;
using Sidecar.Common.Interface;

/// <summary>
/// STUB — Metadata restore service.
///
/// BLOCKER: Implementation requires a decided archival/snapshot backend.
/// No such mechanism exists in the repo today. Options under evaluation:
///   - Azure Cosmos DB continuous backup + point-in-time restore
///   - Custom metadata snapshot written to Azure Storage at dataset creation / tier change
///   - Cosmos DB change-feed replay from a snapshot stored in Azure Storage
///
/// The interface (IMetadataRestoreService) is intentionally backend-agnostic.
/// Replace this stub with the real implementation once the archival backend is confirmed.
/// </summary>
public class MetadataRestoreService(ILogger<MetadataRestoreService> logger) : IMetadataRestoreService
{
    private readonly ILogger<MetadataRestoreService> _logger = logger ?? throw new ArgumentNullException(nameof(logger));

    /// <inheritdoc/>
    public Task RestoreAsync(string sdPath, string restorePointInTime, string operationId, CancellationToken ct)
    {
        _logger.LogError(
            "MetadataRestoreService is not yet implemented. " +
            "Archival backend has not been decided or built yet. " +
            "OperationId: {OperationId}, SdPath: {SdPath}, RestorePoint: {RestorePointInTime}",
            operationId, sdPath, restorePointInTime);

        throw new NotImplementedException(
            "Metadata restore is not yet implemented. " +
            "The archival/snapshot backend has not been decided or built.");
    }
}
