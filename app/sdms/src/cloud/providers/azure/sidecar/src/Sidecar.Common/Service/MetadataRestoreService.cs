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

using System.Net;
using Microsoft.Azure.Cosmos;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json.Linq;
using Sidecar.Common.Exceptions;
using Sidecar.Common.Interface;
using Sidecar.Common.Model;
using Sidecar.Common.Utility;

/// <summary>
/// Cosmos metadata restore service.
///
/// FinalizeRestoreAsync
/// Restores the Cosmos metadata document to the target point-in-time. Called after blob
/// restore completes, so storage is ready when metadata becomes active. The flow is a
/// read-then-write over two Cosmos containers:
///   - the primary "data" container (live datasets), and
///   - the "ArchiveDatasetMetadata" container (point-in-time snapshots).
///
/// Storage-location discovery (gcsurl, blob paths) is NOT handled here — it is a storage
/// concern owned by IDatasetStorageInfoProvider and orchestrated by the executor.
///
/// Steps:
///   1. If the dataset still exists in the data container, archive its current state into
///      the archive container (so the pre-restore state is preserved).
///   2. Select the archived snapshot whose version was active at the requested restore
///      point in time and write it back into the data container.
///   3. If the dataset was already deleted, skip the archive step and restore the matching
///      snapshot directly from the archive container.
/// </summary>
public class MetadataRestoreService(
    ILogger<MetadataRestoreService> logger,
    ICosmosClientFactory cosmosClientFactory,
    IArchivedSnapshotSelector snapshotSelector) : IMetadataRestoreService
{
    private readonly ILogger<MetadataRestoreService> _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    private readonly ICosmosClientFactory _cosmosClientFactory = cosmosClientFactory ?? throw new ArgumentNullException(nameof(cosmosClientFactory));
    private readonly IArchivedSnapshotSelector _snapshotSelector = snapshotSelector ?? throw new ArgumentNullException(nameof(snapshotSelector));

    /// <inheritdoc/>
    public async Task FinalizeRestoreAsync(string sdPath, string restorePointInTime, string operationId, CancellationToken ct)
    {
        var parts = SdPathParser.Parse(sdPath);

        var restorePoint = ParseUtc(restorePointInTime)
            ?? throw new ArgumentException(
                $"Invalid restorePointInTime '{restorePointInTime}'. Expected an ISO-8601 timestamp.",
                nameof(restorePointInTime));

        var endpoint = await _cosmosClientFactory.GetCosmosConnectionEndpointAsync(parts.Tenant, ct);
        var cosmosClient = _cosmosClientFactory.GetCosmosClient(endpoint);
        var database = cosmosClient.GetDatabase(Constants.CosmosDb.DATABASE_ID);
        var dataContainer = database.GetContainer(Constants.CosmosDb.DATA_CONTAINER_ID);
        var archiveContainer = database.GetContainer(Constants.CosmosDb.ARCHIVE_DATASET_METADATA_CONTAINER_ID);

        // --- 1. Archive the current live document (if the dataset still exists) ---
        var currentDocument = await ReadCurrentDatasetAsync(dataContainer, parts, ct);

        // The lifecycle key scopes snapshot selection to a single "life" of this sdPath. Because
        // the Cosmos id/sdPath are deterministic (hash of tenant/subproject/path/name), a
        // delete + recreate reuses the same id, so one sdPath partition can interleave several
        // lives; selecting across all of them could jump into a previous life or a deletion gap.
        long? lifecycleKey;

        if (currentDocument is not null)
        {
            // Case 1 (live dataset) lifecycle lower bound. The Cosmos id/sdPath are deterministic
            // (hash of tenant/subproject/path/name, no UUID or timestamp), so a delete + recreate
            // with the same name reuses the same id and an sdPath can span multiple "lives."
            // Point-in-time restore is scoped to the CURRENT lifecycle: a restore point at or before
            // this live version's created_date belongs to an earlier lifecycle (or predates the
            // dataset) and is rejected as out of range before anything is archived or overwritten.
            EnforceLiveLifecycleLowerBound(currentDocument, restorePoint, restorePointInTime, sdPath, operationId);

            await ArchiveCurrentDatasetAsync(endpoint, archiveContainer, sdPath, currentDocument, operationId, ct);

            // Archiving the live version writes it as a snapshot with archivedAt = now, so a restore
            // point inside the current version's window is selected by the same two-sided query
            // below (no separate live fallback needed). The current life's key is its created_date.
            lifecycleKey = ResolveLiveLifecycleKey(currentDocument);
        }
        else
        {
            _logger.LogInformation(
                "Dataset not present in data container; restoring directly from archive - SdPath: {SdPath}, OperationId: {OperationId}",
                sdPath, operationId);

            // Case 2 (deleted lifecycle): with no live document to anchor on, scope selection to the
            // most recent archived lifecycle for this sdPath. A restore point that falls in an
            // earlier life (or a gap) then matches no version and is correctly reported out of range.
            lifecycleKey = await _snapshotSelector.ResolveLatestLifecycleKeyAsync(endpoint, sdPath, ct);
        }

        // --- 2. Select the archived snapshot active at the restore point ---
        // Read-side discovery (IDatasetStorageInfoProvider) has already validated that a snapshot
        // covers this restore point and rejected out-of-range points before any blob restore ran, so
        // a null here is a deterministic, terminal request-level outcome rather than a transient
        // fault. Surface it as a rejection (not an operational failure) so the executor marks the
        // operation Rejected and releases its locks instead of retrying a request that can never
        // succeed and holding the locks across every redelivery.
        var restorePointEpochMs = new DateTimeOffset(restorePoint, TimeSpan.Zero).ToUnixTimeMilliseconds();
        var snapshot = await _snapshotSelector.SelectSnapshotAsync(
            endpoint, sdPath, restorePointEpochMs, lifecycleKey, operationId, ct)
            ?? throw new RestoreRejectedException(
                $"No archived metadata snapshot covers restore point '{restorePointInTime}' for SdPath '{sdPath}'. " +
                $"OperationId: {operationId}");

        // --- 3. Write the selected snapshot back into the data container ---
        await RestoreSnapshotAsync(dataContainer, snapshot, operationId, ct);

        _logger.LogInformation(
            "Metadata restore completed - SdPath: {SdPath}, RestoredVersionCreatedAtEpochMs: {VersionCreatedAtEpochMs}, RestorePoint: {RestorePoint}, OperationId: {OperationId}",
            sdPath, snapshot.VersionCreatedAtEpochMs, restorePointInTime, operationId);
    }

    /// <summary>
    /// Reads the current live dataset document from the data container, or null
    /// if the dataset has already been deleted.
    /// </summary>
    private static async Task<JObject?> ReadCurrentDatasetAsync(
        Container dataContainer, SdPathParts parts, CancellationToken ct)
    {
        var query = new QueryDefinition(
            "SELECT * FROM c WHERE c.data.tenant = @tenant AND c.data.subproject = @subproject AND c.data.path = @path AND c.data.name = @name")
            .WithParameter("@tenant", parts.Tenant)
            .WithParameter("@subproject", parts.Subproject)
            .WithParameter("@path", parts.Path)
            .WithParameter("@name", parts.Dataset);

        using var iterator = dataContainer.GetItemQueryIterator<JObject>(query);
        while (iterator.HasMoreResults)
        {
            var page = await iterator.ReadNextAsync(ct);
            foreach (var document in page)
            {
                return document;
            }
        }

        return null;
    }

    /// <summary>
    /// Writes a point-in-time snapshot of the current live document into the
    /// archive container, stamped with archivedAt/versionCreatedAtEpochMs/datasetCreatedAtEpochMs.
    ///
    /// Idempotent per operation and race-safe WITHOUT relying on the dataset lock. The snapshot id
    /// is deterministic for a given (dataset-life, operation), so a redelivered or genuinely
    /// concurrent finalize of the same operation produces the identical id and the CreateItemAsync
    /// below fails with a 409 Conflict on Cosmos's (id, partitionKey) uniqueness instead of writing
    /// a second snapshot under a fresh archivedAt. The 409 is swallowed as success. The cheap
    /// operationId existence pre-check remains only as a fast path to skip the write on the common
    /// retry case; correctness no longer depends on it (or on the lock) holding across the check.
    /// </summary>
    private async Task ArchiveCurrentDatasetAsync(
        string endpoint, Container archiveContainer, string sdPath, JObject currentDocument, string operationId, CancellationToken ct)
    {
        if (await ArchiveSnapshotExistsForOperationAsync(archiveContainer, sdPath, operationId, ct))
        {
            _logger.LogInformation(
                "Skipping archive of current dataset; a snapshot already exists for this operation (idempotent retry) - SdPath: {SdPath}, OperationId: {OperationId}",
                sdPath, operationId);
            return;
        }

        var cleanDocument = currentDocument.StripSystemProperties();
        var datasetId = cleanDocument.Value<string>("id")
            ?? throw new InvalidOperationException(
                $"Live dataset document is missing an 'id'. SdPath: {sdPath}, OperationId: {operationId}");

        var data = cleanDocument["data"] as JObject;

        // archivedAt is the END (upper edge) of this version's live window (the instant it is being
        // replaced by the restore). Writes are lock-serialized per dataset, so this epoch-ms value
        // is unique, monotonic and millisecond-precise per dataset, making it the authoritative
        // ordering key and window-end.
        var archivedAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        // datasetCreatedAtEpochMs is the lifecycle key: every version of THIS life shares the same
        // value (parsed from created_date), so scoping a restore query to it isolates the current
        // lifecycle and makes earlier lives (and the gaps between them) unreachable. Falls back to
        // the Cosmos _ts (seconds -> ms) when created_date is absent.
        var datasetCreatedAtEpochMs = ToEpochMsOrDefault(
            data?.Value<string>("created_date"), (currentDocument.Value<long?>("_ts") ?? 0L) * 1000L);

        // versionCreatedAt is the START (lower edge) of this version's live window: the instant THIS
        // exact version became live, which equals the archivedAt (window END) of the version it
        // replaced. It is sourced from the predecessor snapshot's archivedAt — millisecond-precise
        // and on the same clock as archivedAt and blob PITR — rather than the live document's _ts,
        // because _ts is Unix SECONDS and truncation to the second would make consecutive windows
        // [versionCreatedAt, archivedAt) overlap by up to 999 ms. Archive-on-write makes those
        // windows exactly contiguous, so every restore point maps to exactly one version. The first
        // version of the lifecycle has no predecessor, so it falls back to the dataset's created date.
        var predecessorArchivedAtEpochMs = await _snapshotSelector.ResolveLatestArchivedAtAsync(
            endpoint, sdPath, datasetCreatedAtEpochMs, ct);
        var versionCreatedAtEpochMs = predecessorArchivedAtEpochMs ?? datasetCreatedAtEpochMs;

        var snapshot = new ArchivedDatasetMetadata
        {
            // Trailing segment is the operationId (NOT the non-deterministic archivedAt) so a
            // redelivered/concurrent finalize of this operation computes the identical id and
            // collides on Cosmos's (id, partitionKey) uniqueness in CreateItemAsync below instead
            // of writing a duplicate snapshot.
            Id = $"{datasetId}__{datasetCreatedAtEpochMs}__{operationId}",
            SdPath = sdPath,
            OperationId = operationId,
            Operation = ArchiveOperation.restore,
            ArchivedAtEpochMs = archivedAt,
            VersionCreatedAtEpochMs = versionCreatedAtEpochMs,
            DatasetCreatedAtEpochMs = datasetCreatedAtEpochMs,
            Document = cleanDocument,
        };

        // Partition key is /sdPath: all versions and lifecycles of a dataset are colocated so
        // restore selection (which filters by c.sdPath) is a single-partition seek. The unique
        // document id above is the composite lifecycle+operation key, NOT the partition key.
        // CreateItemAsync (not Upsert) so a concurrent/redelivered finalize of the same operation
        // collides on the deterministic id and is rejected with 409 rather than silently
        // overwriting or duplicating the archived snapshot.
        try
        {
            var response = await archiveContainer.CreateItemAsync(
                snapshot, new PartitionKey(snapshot.SdPath), cancellationToken: ct);

            _logger.LogInformation(
                "Archived current dataset metadata - SdPath: {SdPath}, DatasetId: {DatasetId}, VersionCreatedAtEpochMs: {VersionCreatedAtEpochMs}, RU: {RU}, OperationId: {OperationId}",
                sdPath, datasetId, versionCreatedAtEpochMs, response.RequestCharge, operationId);
        }
        catch (CosmosException ex) when (ex.StatusCode == HttpStatusCode.Conflict)
        {
            // Another finalize of this same operation already archived this version under the
            // identical deterministic id. Exactly one snapshot exists — treat as idempotent success.
            _logger.LogInformation(
                "Archive snapshot already exists for this operation (idempotent create conflict) - SdPath: {SdPath}, DatasetId: {DatasetId}, OperationId: {OperationId}",
                sdPath, datasetId, operationId);
        }
    }

    /// <summary>
    /// Returns true when the archive container already holds a snapshot stamped with this
    /// operationId for the sdPath — i.e. a previous (possibly partially failed) finalize of the same
    /// restore already archived the current document. Single-partition point query on /sdPath.
    /// </summary>
    private static async Task<bool> ArchiveSnapshotExistsForOperationAsync(
        Container archiveContainer, string sdPath, string operationId, CancellationToken ct)
    {
        var query = new QueryDefinition(
                "SELECT TOP 1 c.id FROM c WHERE c.sdPath = @sdPath AND c.operationId = @operationId")
            .WithParameter("@sdPath", sdPath)
            .WithParameter("@operationId", operationId);

        var requestOptions = new QueryRequestOptions
        {
            PartitionKey = new PartitionKey(sdPath),
            MaxItemCount = 1,
        };

        using var iterator = archiveContainer.GetItemQueryIterator<JObject>(query, requestOptions: requestOptions);
        while (iterator.HasMoreResults)
        {
            var page = await iterator.ReadNextAsync(ct);
            if (page.Count > 0)
            {
                return true;
            }
        }

        return false;
    }

    /// <summary>
    /// Resolves the lifecycle key for a live dataset: the epoch-ms of the live document's
    /// created_date. Returns null when created_date is missing/unparseable, in which case selection
    /// is not lifecycle-scoped (relies on the two-sided window and legacy tolerance instead).
    /// </summary>
    private static long? ResolveLiveLifecycleKey(JObject currentDocument)
    {
        var createdDate = (currentDocument["data"] as JObject)?.Value<string>("created_date");
        return DateTimeExtensions.TryParseFlexibleUtc(createdDate, out var parsed)
            ? parsed.ToUnixTimeMilliseconds()
            : null;
    }

    /// <summary>
    /// Restores the snapshot's original document back into the data container
    /// under its original ID.
    /// </summary>
    private async Task RestoreSnapshotAsync(
        Container dataContainer, ArchivedDatasetMetadata snapshot, string operationId, CancellationToken ct)
    {
        var document = snapshot.Document.StripSystemProperties();
        var datasetId = document.Value<string>("id")
            ?? throw new InvalidOperationException(
                $"Archived snapshot '{snapshot.Id}' is missing the original document 'id'. OperationId: {operationId}");

        var response = await dataContainer.UpsertItemAsync(
            document, new PartitionKey(datasetId), cancellationToken: ct);

        _logger.LogInformation(
            "Restored dataset metadata into data container - DatasetId: {DatasetId}, VersionCreatedAtEpochMs: {VersionCreatedAtEpochMs}, RU: {RU}, OperationId: {OperationId}",
            datasetId, snapshot.VersionCreatedAtEpochMs, response.RequestCharge, operationId);
    }

    /// <summary>
    /// Parses a dataset date field (ISO-8601 or JS Date.toString) to Unix epoch milliseconds (UTC),
    /// returning <paramref name="fallback"/> when the value is missing or unparseable.
    /// </summary>
    private static long ToEpochMsOrDefault(string? value, long fallback) =>
        DateTimeExtensions.TryParseFlexibleUtc(value, out var parsed)
            ? parsed.ToUnixTimeMilliseconds()
            : fallback;

    /// <summary>
    /// Enforces the Case 1 (live dataset) lifecycle lower bound: the restore point must be strictly
    /// after the current live version's created_date. Restore points at or before creation belong to
    /// an earlier lifecycle (or predate the dataset) and are rejected. If the live document has no
    /// parseable created_date, the guard is skipped (logged) rather than blocking a valid restore.
    /// </summary>
    private void EnforceLiveLifecycleLowerBound(
        JObject currentDocument, DateTime restorePoint, string restorePointInTime, string sdPath, string operationId)
    {
        // created_date is persisted by the web API via new Date().toString() (a non-ISO JS form),
        // so a tolerant parser is required.
        var createdRaw = (currentDocument["data"] as JObject)?.Value<string>("created_date");
        if (!DateTimeExtensions.TryParseFlexibleUtc(createdRaw, out var createdDate))
        {
            _logger.LogWarning(
                "Live dataset metadata is missing a parseable 'created_date'; skipping lifecycle lower-bound check - SdPath: {SdPath}, OperationId: {OperationId}",
                sdPath, operationId);
            return;
        }

        if (restorePoint <= createdDate.UtcDateTime)
        {
            throw new InvalidOperationException(
                $"Restore point '{restorePointInTime}' is at or before the dataset's creation ('{createdDate:o}'). " +
                $"Point-in-time restore is scoped to the current dataset lifecycle. SdPath: {sdPath}, OperationId: {operationId}");
        }
    }

    private static DateTime? ParseUtc(string? value) =>
        DateTimeExtensions.TryParseFlexibleUtc(value, out var parsed)
            ? parsed.UtcDateTime
            : null;
}
