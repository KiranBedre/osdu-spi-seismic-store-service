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
using Sidecar.Common.Interface;
using Sidecar.Common.Model;
using Sidecar.Common.Utility;

/// <summary>
/// Resolves dataset storage information by reading the active dataset document from Cosmos.
/// </summary>
public class CosmosDatasetStorageInfoProvider(
    ILogger<CosmosDatasetStorageInfoProvider> logger,
    IDataAccess dataAccess,
    ICosmosClientFactory cosmosClientFactory)
    : IDatasetStorageInfoProvider
{
    private readonly ILogger<CosmosDatasetStorageInfoProvider> _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    private readonly IDataAccess _dataAccess = dataAccess ?? throw new ArgumentNullException(nameof(dataAccess));
    private readonly ICosmosClientFactory _cosmosClientFactory = cosmosClientFactory ?? throw new ArgumentNullException(nameof(cosmosClientFactory));

    /// <inheritdoc/>
    public async Task<DatasetStorageInfo> ResolveDatasetInfoAsync(string sdPath, string operationId, CancellationToken ct)
    {
        var blobs = new List<string>();

        try
        {
            var sdPathParts = ParseSdPath(sdPath);
            var endpoint = await _cosmosClientFactory.GetCosmosConnectionEndpointAsync(sdPathParts.Tenant, ct);

            // Primary lookup: live dataset records in the default data container. Archival
            // snapshots live in a SEPARATE container (see the archival TODO below), so they never
            // appear here and no archivedAt filter is needed.
            const string PrimaryQuery = @"SELECT TOP 1 c.data.gcsurl, c.data.files FROM c
    WHERE c.data.tenant = @tenant
    AND c.data.subproject = @subproject
    AND c.data.path = @path
    AND c.data.name = @name
    AND IS_DEFINED(c.data.gcsurl)
    ORDER BY c._ts DESC";

            var parameters = JsonConvert.SerializeObject(new List<Parameter>
            {
                new() { Name = "@tenant", Value = sdPathParts.Tenant },
                new() { Name = "@subproject", Value = sdPathParts.Subproject },
                new() { Name = "@path", Value = sdPathParts.Path },
                new() { Name = "@name", Value = sdPathParts.Dataset },
            });

            var records = await _dataAccess.GetRecordsAsync(endpoint, PrimaryQuery, parameters, null, 1, operationId);

            // A dataset resolved only via the archival fallback (not the active/primary records)
            // indicates it was deleted and moved to the archival store.
            var isDeleted = false;

            if (records.records is not { Count: > 0 })
            {
                _logger.LogInformation(
                    "No active metadata found in primary records, trying archival metadata - OperationId: {OperationId}, SdPath: {SdPath}",
                    operationId, sdPath);

                // TODO: Query the archival metadata container for a deleted-dataset fallback.
                // Archival snapshots are written to a SEPARATE Cosmos container
                // (Constants.CosmosDb.ARCHIVE_CONTAINER_ID) on delete/patch/
                // change_tier. Each archival document carries top-level bookkeeping fields
                // (archivedAtEpochMs, operation, OriginalId) alongside a `data` field holding the full
                // dataset-entity snapshot, so entity fields live at the same c.data.* paths as an
                // active record; the newest snapshot reflects the pre-deletion state.
                // IDataAccess.GetRecordsAsync currently targets only the default data container, so
                // it cannot run this query without a container override. Query the archival
                // container directly via _cosmosClientFactory (pattern in ChangeTierFailureTracker)
                // once the approach is finalized. Query to run:
                //   SELECT TOP 1 c.data.gcsurl, c.data.files FROM c
                //   WHERE IS_DEFINED(c.archivedAtEpochMs)
                //     AND c.data.tenant = @tenant AND c.data.subproject = @subproject
                //     AND c.data.path = @path AND c.data.name = @name
                //     AND IS_DEFINED(c.data.gcsurl)
                //   ORDER BY c.archivedAtEpochMs DESC
                // When implemented, set:
                //   records = <archival query result>;
                //   isDeleted = records.records is { Count: > 0 };
            }

            if (records.records is not { Count: > 0 })
            {
                _logger.LogInformation(
                    "No metadata found in primary or archival records for dataset - OperationId: {OperationId}, SdPath: {SdPath}",
                    operationId, sdPath);
                return new DatasetStorageInfo(string.Empty, string.Empty, null, blobs);
            }

            // Primary and archival queries both project the entity at c.data.*, so the
            // resolved record has a single shape here (gcsurl/files at the root).
            var metadataRecord = records.records[0];
            var json = JsonConvert.SerializeObject(metadataRecord);
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

            if (datasetRoot.TryGetProperty("files", out var filesElement) &&
                filesElement.ValueKind == JsonValueKind.Array)
            {
                foreach (var file in filesElement.EnumerateArray())
                {
                    if (file.ValueKind == JsonValueKind.Object &&
                        file.TryGetProperty("path", out var pathElement) &&
                        pathElement.ValueKind == JsonValueKind.String)
                    {
                        var blobPath = pathElement.GetString();
                        if (!string.IsNullOrWhiteSpace(blobPath))
                        {
                            blobs.Add(blobPath);
                        }
                    }
                }
            }

            _logger.LogInformation(
                "Extracted {BlobCount} blob paths from metadata - Container: {Container}, OperationId: {OperationId}",
                blobs.Count, containerName, operationId);

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

            return new DatasetStorageInfo(gcsurl, containerName, virtualFolder, blobs, accessPolicy, isDeleted);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex,
                "Failed to resolve dataset storage info from metadata - OperationId: {OperationId}, Error: {Error}",
                operationId, ex.Message);
            throw;
        }
    }

    private static SdPathParts ParseSdPath(string sdPath)
    {
        if (string.IsNullOrWhiteSpace(sdPath) || !sdPath.StartsWith("sd://", StringComparison.OrdinalIgnoreCase))
        {
            throw new ArgumentException($"Invalid sdPath format: '{sdPath}'. Expected format: sd://<tenant>/<subproject>/...", nameof(sdPath));
        }

        var tokens = sdPath[5..].Trim('/').Split('/', StringSplitOptions.RemoveEmptyEntries);
        if (tokens.Length < 3)
        {
            throw new ArgumentException($"Invalid dataset sdPath format: '{sdPath}'. Expected format: sd://<tenant>/<subproject>/<path>/<dataset>.", nameof(sdPath));
        }

        var tenant = tokens[0];
        var subproject = tokens[1];
        var dataset = tokens[^1];
        var pathTokens = tokens.Skip(2).Take(tokens.Length - 3).ToArray();
        var path = pathTokens.Length == 0 ? "/" : "/" + string.Join('/', pathTokens) + "/";

        return new SdPathParts(tenant, subproject, path, dataset);
    }

    private sealed record SdPathParts(string Tenant, string Subproject, string Path, string Dataset);
}