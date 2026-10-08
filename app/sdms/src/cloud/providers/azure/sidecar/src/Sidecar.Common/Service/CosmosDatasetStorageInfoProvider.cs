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

using System.Text.Json;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json;
using Sidecar.Common.Exceptions;
using Sidecar.Common.Interface;
using Sidecar.Common.Model;
using Sidecar.Common.Utility;

/// <summary>
/// Resolves dataset storage information by reading the active dataset document from Cosmos.
/// </summary>
public class CosmosDatasetStorageInfoProvider(
    ILogger<CosmosDatasetStorageInfoProvider> logger,
    IDataAccess dataAccess,
    ICosmosClientFactory cosmosClientFactory,
    IArchivedSnapshotSelector snapshotSelector)
    : IDatasetStorageInfoProvider
{
    private readonly ILogger<CosmosDatasetStorageInfoProvider> _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    private readonly IDataAccess _dataAccess = dataAccess ?? throw new ArgumentNullException(nameof(dataAccess));
    private readonly ICosmosClientFactory _cosmosClientFactory = cosmosClientFactory ?? throw new ArgumentNullException(nameof(cosmosClientFactory));
    private readonly IArchivedSnapshotSelector _snapshotSelector = snapshotSelector ?? throw new ArgumentNullException(nameof(snapshotSelector));

    /// <inheritdoc/>
    public async Task<DatasetStorageInfo> ResolveDatasetInfoAsync(string sdPath, string restorePointInTime, string operationId, CancellationToken ct)
    {
        try
        {
            var sdPathParts = SdPathParser.Parse(sdPath);
            var endpoint = await _cosmosClientFactory.GetCosmosConnectionEndpointAsync(sdPathParts.Tenant, ct);

            // Parse the requested point-in-time once. It is authoritative for both the archive
            // window comparison and the live-version fallback guards below.
            if (!DateTimeExtensions.TryParseFlexibleUtc(restorePointInTime, out var restorePointOffset))
            {
                throw new ArgumentException(
                    $"Invalid restorePointInTime '{restorePointInTime}'. Expected an ISO-8601 timestamp.",
                    nameof(restorePointInTime));
            }

            var restorePointEpochMs = restorePointOffset.ToUnixTimeMilliseconds();

            // 1. Live lookup in the data container. Its presence/absence is the SOLE source of truth
            // for isDeleted: the archive is consulted for live datasets too (a past version may have
            // been active at the restore point), so "answered from archive" no longer implies
            // deleted.
            const string PRIMARYQUERY = @"SELECT c.data.gcsurl, c.data.filemetadata, c.data.created_date, c.data.last_modified_date FROM c
    WHERE c.data.tenant = @tenant
    AND c.data.subproject = @subproject
    AND c.data.path = @path
    AND c.data.name = @name";

            var parameters = JsonConvert.SerializeObject(new List<Parameter>
            {
                new() { Name = "@tenant", Value = sdPathParts.Tenant },
                new() { Name = "@subproject", Value = sdPathParts.Subproject },
                new() { Name = "@path", Value = sdPathParts.Path },
                new() { Name = "@name", Value = sdPathParts.Dataset },
            });

            var liveRecords = await _dataAccess.GetRecordsAsync(endpoint, PRIMARYQUERY, parameters, null, 1, operationId);
            var liveExists = liveRecords.records is { Count: > 0 };
            var isDeleted = !liveExists;

            // Live version bounds (created_date = lifecycle start; last_modified_date = current
            // version start), computed once from the live projection for lifecycle scoping and the
            // fallback guards.
            long? liveCreatedEpochMs = null;
            long? liveVersionStartEpochMs = null;
            if (liveExists)
            {
                var liveJson = JsonConvert.SerializeObject(liveRecords.records![0]);
                using var liveDoc = JsonDocument.Parse(liveJson);
                var liveRoot = liveDoc.RootElement;
                liveCreatedEpochMs = TryGetEpochMs(liveRoot, "created_date");
                liveVersionStartEpochMs = TryGetEpochMs(liveRoot, "last_modified_date") ?? liveCreatedEpochMs;
            }

            // 2. Lifecycle key scopes archive selection to a single "life" of this sdPath (delete +
            // recreate reuses the same deterministic id, so one sdPath can interleave several lives).
            // Live -> the current life's created_date; deleted -> the most recent archived life.
            var lifecycleKey = liveExists
                ? liveCreatedEpochMs
                : await _snapshotSelector.ResolveLatestLifecycleKeyAsync(endpoint, sdPath, ct);

            // 3. Archive-interval-first: the version whose half-open window
            // [versionCreatedAt, archivedAt) contains the restore point. For a live dataset this
            // finds a PAST version when the restore point predates the current one; it returns
            // nothing when the restore point falls in the still-live (unarchived) current window.
            // Selection goes through the shared IArchivedSnapshotSelector so this reader and the
            // metadata reader can never pick different versions for the same restore point.
            var archivedSnapshot = await _snapshotSelector.SelectSnapshotAsync(
                endpoint, sdPath, restorePointEpochMs, lifecycleKey, operationId, ct);

            // Decide which version to restore from using the pure selection logic (archive-interval-
            // first, then the current-lifecycle live fallback). Keeping the branching in a side-effect-
            // free function lets it be exercised exhaustively with table-driven tests.
            var decision = RestoreVersionSelector.Decide(
                hasArchivedSnapshot: archivedSnapshot is not null,
                liveExists: liveExists,
                liveCreatedEpochMs: liveCreatedEpochMs,
                liveVersionStartEpochMs: liveVersionStartEpochMs,
                restorePointEpochMs: restorePointEpochMs);

            object? selectedRecord;
            switch (decision)
            {
                case RestoreVersionDecision.UseArchivedSnapshot:
                    // The archive stores the full dataset document under "document"; its "data" node
                    // carries gcsurl/filemetadata at the same shape the live projection uses, so
                    // downstream extraction below is identical for both paths.
                    selectedRecord = archivedSnapshot!.Document["data"]
                        ?? throw new InvalidOperationException(
                            $"Archived snapshot '{archivedSnapshot.Id}' is missing its 'data' node. OperationId: {operationId}, SdPath: {sdPath}");
                    break;

                case RestoreVersionDecision.UseLiveDocument:
                    // Metadata may be unchanged while blobs change independently. Use the live
                    // document to locate storage and establish expected content; metadata finalize
                    // archives this document before selecting it for the requested point.
                    selectedRecord = liveRecords.records![0];
                    break;

                case RestoreVersionDecision.RejectBeforeCreation:
                    throw new RestoreRejectedException(
                        $"Restore point '{restorePointInTime}' is at or before the dataset's creation. " +
                        $"Point-in-time restore is scoped to the current dataset lifecycle. OperationId: {operationId}, SdPath: {sdPath}");

                case RestoreVersionDecision.RejectNoLiveVersion:
                    throw new RestoreRejectedException(
                        $"Restore point '{restorePointInTime}' falls in a period with no live version for this dataset. " +
                        $"OperationId: {operationId}, SdPath: {sdPath}");

                case RestoreVersionDecision.RejectDeletedNoVersion:
                default:
                    // Deleted dataset with no archived version covering the restore point: the dataset
                    // did not exist at that instant (point in an earlier life, a deletion gap, or before
                    // it ever existed). Reject with a clear out-of-range message, mirroring the metadata
                    // restore path, instead of returning an empty result that would surface as a
                    // confusing empty-container failure downstream.
                    throw new RestoreRejectedException(
                        $"No dataset version existed at restore point '{restorePointInTime}' for SdPath '{sdPath}'. " +
                        $"The dataset was deleted or did not exist at that instant. OperationId: {operationId}");
            }

            // Primary and archival queries both project the entity at c.data.*, so the
            // resolved record has a single shape here (gcsurl/filemetadata at the root).
            var json = JsonConvert.SerializeObject(selectedRecord);
            using var doc = JsonDocument.Parse(json);
            var datasetRoot = doc.RootElement;

            if (!datasetRoot.TryGetProperty("gcsurl", out var gcsurlElement) ||
                gcsurlElement.ValueKind != JsonValueKind.String ||
                string.IsNullOrWhiteSpace(gcsurlElement.GetString()))
            {
                throw new InvalidOperationException(
                    $"Dataset metadata is missing 'gcsurl'. Cannot resolve storage container. OperationId: {operationId}, SdPath: {sdPath}");
            }

            var gcsurl = gcsurlElement.GetString()!;
            var (containerName, virtualFolder) = Utils.ParseContainerAndFolderPath(gcsurl);

            _logger.LogInformation(
                "Resolved storage location from gcsurl - GcsUrl: {GcsUrl}, Container: {Container}, VirtualFolder: {VirtualFolder}, OperationId: {OperationId}",
                gcsurl, containerName, virtualFolder, operationId);

            // The dataset document has no per-blob path list; its content summary lives in the
            // "filemetadata" object (e.g. { "size": <bytes>, "nobjects": <count>, "type": ... }).
            // These fields may be absent (or non-numeric) on a given version, so keep them null when
            // missing rather than defaulting to 0: a null means "not recorded, cannot validate" and
            // is distinct from a recorded 0 (an empty dataset). Consistency validation skips (and
            // logs) any figure that is null so a missing count/size does not falsely assert an empty
            // range.
            long? expectedObjectCount = null;
            long? expectedTotalSize = null;
            if (datasetRoot.TryGetProperty("filemetadata", out var fileMetaElement) &&
                fileMetaElement.ValueKind == JsonValueKind.Object)
            {
                expectedObjectCount = TryGetLong(fileMetaElement, "nobjects");
                expectedTotalSize = TryGetLong(fileMetaElement, "size");
            }

            if (expectedObjectCount is null)
            {
                _logger.LogWarning(
                    "filemetadata.nobjects is missing or non-numeric; object-count consistency validation will be skipped - Container: {Container}, OperationId: {OperationId}, SdPath: {SdPath}",
                    containerName, operationId, sdPath);
            }

            if (expectedTotalSize is null)
            {
                _logger.LogWarning(
                    "filemetadata.size is missing or non-numeric; total-size consistency validation will be skipped - Container: {Container}, OperationId: {OperationId}, SdPath: {SdPath}",
                    containerName, operationId, sdPath);
            }

            _logger.LogInformation(
                "Extracted content summary from filemetadata - ExpectedObjectCount: {ExpectedObjectCount}, ExpectedTotalSize: {ExpectedTotalSize}, Container: {Container}, OperationId: {OperationId}",
                expectedObjectCount, expectedTotalSize, containerName, operationId);

            // Infer the effective access policy from the gcsurl layout instead of a second
            // Cosmos round-trip. Dataset-policy datasets get a dedicated container
            // ("bucket-<uuid>", no virtual folder); uniform-policy datasets share a container
            // ("bucket/<uuid>"). The gcsurl records the layout at dataset-creation time, which is
            // exactly what container restore must act on (and is more reliable than the
            // subproject's *current* access_policy, which may have changed since creation).
            var accessPolicy = string.IsNullOrWhiteSpace(virtualFolder)
                ? Constants.AccessPolicy.DATASET
                : Constants.AccessPolicy.UNIFORM;

            _logger.LogInformation(
                "Resolved dataset storage info - Container: {Container}, AccessPolicy: {AccessPolicy}, IsDeleted: {IsDeleted}, OperationId: {OperationId}",
                containerName, accessPolicy, isDeleted, operationId);

            return new DatasetStorageInfo(gcsurl, containerName, virtualFolder, expectedObjectCount, expectedTotalSize, accessPolicy, isDeleted);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex,
                "Failed to resolve dataset storage info from metadata - OperationId: {OperationId}, Error: {Error}",
                operationId, ex.Message);
            throw;
        }
    }

    /// <summary>
    /// Parses a dataset date field (ISO-8601 or JS Date.toString) on the projected record to Unix
    /// epoch milliseconds (UTC), or null when the field is missing or unparseable.
    /// </summary>
    private static long? TryGetEpochMs(JsonElement root, string field)
    {
        if (root.TryGetProperty(field, out var element) &&
            element.ValueKind == JsonValueKind.String &&
            DateTimeExtensions.TryParseFlexibleUtc(element.GetString(), out var parsed))
        {
            return parsed.ToUnixTimeMilliseconds();
        }

        return null;
    }

    /// <summary>
    /// Reads an integral field (e.g. filemetadata.nobjects or filemetadata.size) from the projected
    /// record as a non-negative <see cref="long"/>, or null when the field is missing, non-numeric,
    /// or negative. Accepts values encoded either as JSON numbers or numeric strings.
    /// </summary>
    private static long? TryGetLong(JsonElement root, string field)
    {
        if (!root.TryGetProperty(field, out var element))
        {
            return null;
        }

        long? value = element.ValueKind switch
        {
            JsonValueKind.Number when element.TryGetInt64(out var number) => number,
            JsonValueKind.String when long.TryParse(element.GetString(), out var parsed) => parsed,
            _ => null,
        };

        return value >= 0 ? value : null;
    }
}