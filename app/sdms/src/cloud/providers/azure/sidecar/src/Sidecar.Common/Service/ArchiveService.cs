// ============================================================================
// Copyright 2026, Microsoft Corporation
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

using Microsoft.Azure.Cosmos;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json.Linq;
using Sidecar.Common.Interface;
using Sidecar.Common.Model;
using Sidecar.Common.Utility;

/// <summary>
/// Archives dataset metadata snapshots to the 'ArchiveDatasetMetadata' Cosmos container
/// before mutations, enabling point-in-time restore.
/// </summary>
public class ArchiveService : IArchiveService
{
    private readonly ILogger<ArchiveService> _logger;
    private readonly ICosmosClientFactory _cosmosClientFactory;
    private readonly IArchivedSnapshotSelector _snapshotSelector;
    private readonly bool _isRestoreEnabled;
    private readonly int _archiveTtlSeconds;

    private const int DefaultRestoreMaxDays = 30;

    // Environment variable names (read only by this service)
    private const string FeatureFlagEnableRestoreEnvVar = "FEATURE_FLAG_ENABLE_RESTORE";
    private const string RestoreMaxDaysEnvVar = "SDMS_RESTORE_MAX_DAYS";

    // Source dataset document property names, as written by the Node.js service
    private const string DataProperty = "data";
    private const string CreatedDateProperty = "created_date";
    private const string TenantProperty = "tenant";
    private const string SubprojectProperty = "subproject";
    private const string PathProperty = "path";
    private const string NameProperty = "name";

    public ArchiveService(
        ILogger<ArchiveService> logger,
        ICosmosClientFactory cosmosClientFactory,
        IArchivedSnapshotSelector snapshotSelector)
    {
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        _cosmosClientFactory = cosmosClientFactory ?? throw new ArgumentNullException(nameof(cosmosClientFactory));
        _snapshotSelector = snapshotSelector ?? throw new ArgumentNullException(nameof(snapshotSelector));
        _isRestoreEnabled = string.Equals(
            Environment.GetEnvironmentVariable(FeatureFlagEnableRestoreEnvVar),
            "true", StringComparison.OrdinalIgnoreCase);

        // Derive archive TTL from restore max days (same config that gates the restore window)
        var restoreMaxDaysStr = Environment.GetEnvironmentVariable(RestoreMaxDaysEnvVar);
        var restoreMaxDays = int.TryParse(restoreMaxDaysStr, out var days) && days > 0 ? days : DefaultRestoreMaxDays;
        _archiveTtlSeconds = restoreMaxDays * 24 * 60 * 60;
    }

    public async Task ArchiveBeforeUpdateAsync(string dataPartitionId, string id, ArchiveOperation operation, string? operationId = null)
    {
        if (!_isRestoreEnabled) return;
        await ArchiveCurrentStateAsync(dataPartitionId, id, operation, operationId);
    }

    public async Task ArchiveBeforeDeleteAsync(string dataPartitionId, string id, string? operationId = null)
    {
        if (!_isRestoreEnabled) return;
        await ArchiveCurrentStateAsync(dataPartitionId, id, ArchiveOperation.bulk_delete, operationId);
    }

    private async Task ArchiveCurrentStateAsync(string dataPartitionId, string id, ArchiveOperation operation, string? operationId)
    {
        var cs = await _cosmosClientFactory.GetCosmosConnectionEndpointAsync(dataPartitionId);
        var client = _cosmosClientFactory.GetCosmosClient(cs);
        var database = client.GetDatabase(Constants.CosmosDb.DATABASE_ID);
        var dataContainer = database.GetContainer(Constants.CosmosDb.DATA_CONTAINER_ID);

        // Read current state from primary data container.
        // Use JObject (Newtonsoft) because the Cosmos client serializes with Newtonsoft;
        // deserializing into System.Text.Json.JsonElement yields an empty/undefined value.
        JObject fullDocument;
        try
        {
            var response = await dataContainer.ReadItemAsync<JObject>(id, new PartitionKey(id));
            fullDocument = response.Resource;
        }
        catch (CosmosException ex) when (ex.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            // Item doesn't exist (first write or already deleted) — nothing to archive
            _logger.LogDebug("Archive skip: item {Id} not found in data container (OperationId: {OperationId})", id, operationId);
            return;
        }

        // Write snapshot to archive container
        var archiveContainer = database.GetContainer(Constants.CosmosDb.ARCHIVE_DATASET_METADATA_CONTAINER_ID);
        var timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        // datasetCreatedAt: lifecycle key (created_date). Every version of THIS life shares it.
        var dataNode = fullDocument[DataProperty] as JObject;
        var datasetCreatedAtEpochMs = dataNode is not null
            ? DateTimeExtensions.ParseJsDateToEpochMs(dataNode[CreatedDateProperty]?.ToString())
            : 0L;

        // Partition key: must be the sd:// dataset path the restore reader queries by, not the doc id.
        var sdPath = SdPathParser.Build(
            dataNode?[TenantProperty]?.ToString(),
            dataNode?[SubprojectProperty]?.ToString(),
            dataNode?[PathProperty]?.ToString(),
            dataNode?[NameProperty]?.ToString(),
            id);

        // versionCreatedAt: the version's live-window START = the instant this version became live =
        // the predecessor snapshot's archivedAt (millisecond-precise, same clock as archivedAt/blob
        // PITR). Sourcing it from the live doc's _ts (Unix SECONDS) would truncate to the second and
        // make consecutive windows [versionCreatedAt, archivedAt) overlap by up to 999 ms. The first
        // version of the lifecycle has no predecessor, so it falls back to the dataset's created date.
        var predecessorArchivedAtEpochMs = await _snapshotSelector.ResolveLatestArchivedAtAsync(
            cs, sdPath, datasetCreatedAtEpochMs, CancellationToken.None);
        var versionCreatedAtEpochMs = predecessorArchivedAtEpochMs ?? datasetCreatedAtEpochMs;

        // Store the full document ({ id, data }) so restore can read document.id and document.data.
        var document = fullDocument.StripSystemProperties();

        var archiveEntry = new ArchivedDatasetMetadata
        {
            Id = $"{id}__{datasetCreatedAtEpochMs}__{timestamp}",
            SdPath = sdPath,
            ArchivedAtEpochMs = timestamp,
            Operation = operation,
            DatasetCreatedAtEpochMs = datasetCreatedAtEpochMs,
            VersionCreatedAtEpochMs = versionCreatedAtEpochMs,
            Document = document,
            Ttl = _archiveTtlSeconds
        };

        try
        {
            await archiveContainer.CreateItemAsync(archiveEntry, new PartitionKey(sdPath));
            _logger.LogDebug("Archived dataset {Id} before {Operation} (OperationId: {OperationId})", id, operation, operationId);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Archival failed for dataset {Id} before {Operation} (OperationId: {OperationId})", id, operation, operationId);
            throw;
        }
    }

}
