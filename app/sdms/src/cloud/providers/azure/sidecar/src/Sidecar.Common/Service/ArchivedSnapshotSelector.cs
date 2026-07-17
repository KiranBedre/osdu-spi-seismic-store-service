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

using Microsoft.Azure.Cosmos;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json.Linq;
using Sidecar.Common.Interface;
using Sidecar.Common.Model;
using Sidecar.Common.Utility;

/// <summary>
/// Cosmos-backed implementation of <see cref="IArchivedSnapshotSelector"/>. Owns the ONE archival
/// selection query used by every restore reader so the blob-location reader and the metadata reader
/// can never select different versions for the same restore point. Selection is a single-partition
/// seek (partition key = /sdPath) over the half-open interval [versionCreatedAt, archivedAt).
/// </summary>
public class ArchivedSnapshotSelector(
    ILogger<ArchivedSnapshotSelector> logger,
    ICosmosClientFactory cosmosClientFactory) : IArchivedSnapshotSelector
{
    private readonly ILogger<ArchivedSnapshotSelector> _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    private readonly ICosmosClientFactory _cosmosClientFactory = cosmosClientFactory ?? throw new ArgumentNullException(nameof(cosmosClientFactory));

    /// <inheritdoc/>
    public async Task<ArchivedDatasetMetadata?> SelectSnapshotAsync(
        string endpoint, string sdPath, long restorePointEpochMs, long? lifecycleKey, string operationId, CancellationToken ct)
    {
        // Lifecycle clause is added only when a key was resolved; when absent, the two-sided window
        // alone determines the match.
        var lifecycleClause = lifecycleKey.HasValue
            ? " AND c.datasetCreatedAtEpochMs = @lifecycleKey"
            : string.Empty;

        // Two-sided window + ORDER BY archivedAtEpochMs ASC + TOP 1: Cosmos seeks the version whose live
        // interval [versionCreatedAt, archivedAtEpochMs) contains the restore point and stops at the first
        // match. SELECT * so both readers work off the identical strongly-typed snapshot.
        var query = new QueryDefinition(
                "SELECT TOP 1 * FROM c" +
                " WHERE c.sdPath = @sdPath" +
                " AND c.versionCreatedAtEpochMs <= @restorePoint" +
                " AND c.archivedAtEpochMs > @restorePoint" +
                lifecycleClause +
                " ORDER BY c.archivedAtEpochMs ASC")
            .WithParameter("@sdPath", sdPath)
            .WithParameter("@restorePoint", restorePointEpochMs);

        if (lifecycleKey.HasValue)
        {
            query = query.WithParameter("@lifecycleKey", lifecycleKey.Value);
        }

        var archiveContainer = GetArchiveContainer(endpoint);
        var requestOptions = new QueryRequestOptions
        {
            PartitionKey = new PartitionKey(sdPath),
            MaxItemCount = 1,
        };

        using var iterator = archiveContainer.GetItemQueryIterator<ArchivedDatasetMetadata>(query, requestOptions: requestOptions);
        while (iterator.HasMoreResults)
        {
            var page = await iterator.ReadNextAsync(ct);
            foreach (var candidate in page)
            {
                _logger.LogInformation(
                    "Selected archived snapshot - SdPath: {SdPath}, VersionCreatedAtEpochMs: {VersionCreatedAtEpochMs}, ArchivedAtEpochMs: {ArchivedAtEpochMs}, LifecycleKey: {LifecycleKey}, RestorePointEpochMs: {RestorePointEpochMs}, OperationId: {OperationId}",
                    sdPath, candidate.VersionCreatedAtEpochMs, candidate.ArchivedAtEpochMs, lifecycleKey, restorePointEpochMs, operationId);
                return candidate;
            }
        }

        return null;
    }

    /// <inheritdoc/>
    public async Task<long?> ResolveLatestLifecycleKeyAsync(string endpoint, string sdPath, CancellationToken ct)
    {
        var query = new QueryDefinition(
                "SELECT TOP 1 c.datasetCreatedAtEpochMs FROM c" +
                " WHERE c.sdPath = @sdPath" +
                " ORDER BY c.datasetCreatedAtEpochMs DESC")
            .WithParameter("@sdPath", sdPath);

        var archiveContainer = GetArchiveContainer(endpoint);
        var requestOptions = new QueryRequestOptions
        {
            PartitionKey = new PartitionKey(sdPath),
            MaxItemCount = 1,
        };

        using var iterator = archiveContainer.GetItemQueryIterator<JObject>(query, requestOptions: requestOptions);
        while (iterator.HasMoreResults)
        {
            var page = await iterator.ReadNextAsync(ct);
            foreach (var item in page)
            {
                var key = item.Value<long?>("datasetCreatedAtEpochMs");
                if (key.HasValue)
                {
                    return key;
                }
            }
        }

        return null;
    }

    /// <inheritdoc/>
    public async Task<long?> ResolveLatestArchivedAtAsync(string endpoint, string sdPath, long lifecycleKey, CancellationToken ct)
    {
        // MAX(archivedAtEpochMs) over the lifecycle = the most recently archived version's window
        // END = the instant the current (soon-to-be-archived) version became live. Single-partition
        // aggregate on /sdPath. Returns null when no predecessor has been archived for this lifecycle.
        var query = new QueryDefinition(
                "SELECT VALUE MAX(c.archivedAtEpochMs) FROM c" +
                " WHERE c.sdPath = @sdPath" +
                " AND c.datasetCreatedAtEpochMs = @lifecycleKey")
            .WithParameter("@sdPath", sdPath)
            .WithParameter("@lifecycleKey", lifecycleKey);

        var archiveContainer = GetArchiveContainer(endpoint);
        var requestOptions = new QueryRequestOptions
        {
            PartitionKey = new PartitionKey(sdPath),
            MaxItemCount = 1,
        };

        using var iterator = archiveContainer.GetItemQueryIterator<long?>(query, requestOptions: requestOptions);
        while (iterator.HasMoreResults)
        {
            var page = await iterator.ReadNextAsync(ct);
            foreach (var value in page)
            {
                if (value.HasValue)
                {
                    return value;
                }
            }
        }

        return null;
    }

    private Container GetArchiveContainer(string endpoint)
    {
        var cosmosClient = _cosmosClientFactory.GetCosmosClient(endpoint);
        return cosmosClient
            .GetDatabase(Constants.CosmosDb.DATABASE_ID)
            .GetContainer(Constants.CosmosDb.ARCHIVE_DATASET_METADATA_CONTAINER_ID);
    }
}
