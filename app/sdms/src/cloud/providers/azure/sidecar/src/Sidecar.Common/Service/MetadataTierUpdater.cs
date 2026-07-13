// ============================================================================
// Copyright 2017-2026, Microsoft Corporation
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
using System.Diagnostics;
using System.Threading.Tasks;

using Interface;
using Microsoft.Extensions.Logging;
using Sidecar.Common.Model;
using Sidecar.Common.Utility;

public class MetadataTierUpdater : IMetadataTierUpdater
{
    private readonly ILogger<MetadataTierUpdater> _logger;
    private readonly IDataAccess _dataAccess;
    private readonly ICosmosClientFactory _cosmosClientFactory;
    private readonly IArchiveService _archiveService;

    // Cosmos patch paths for dataset tier metadata (used only by this updater)
    private const string TierClassPatchPath = "/data/filemetadata/tier_class";
    private const string FileMetadataPatchPath = "/data/filemetadata";

    public MetadataTierUpdater(
        ILogger<MetadataTierUpdater> logger,
        IDataAccess dataAccess,
        ICosmosClientFactory cosmosClientFactory,
        IArchiveService archiveService)
    {
        _logger = logger;
        _dataAccess = dataAccess;
        _cosmosClientFactory = cosmosClientFactory;
        _archiveService = archiveService;
    }

    /// <summary>
    /// Updates the tier_class metadata for a dataset.
    /// Uses a two-phase approach: first tries direct path update, then creates missing path structure if needed.
    /// Retry logic is handled by the caller (Polly General pipeline) and Cosmos SDK.
    /// </summary>
    public async Task UpdateTier(string dataPartitionId, string id, string tier, string? operationId = null)
    {
        var stopwatch = Stopwatch.StartNew();

        // Archive current state before mutation
        await _archiveService.ArchiveBeforeUpdateAsync(dataPartitionId, id, ArchiveOperation.change_tier, operationId);

        var cs = await _cosmosClientFactory.GetCosmosConnectionEndpointAsync(dataPartitionId);

        // First try direct path - this works if filemetadata already exists
        var directUpdate = new Dictionary<string, object> {
            { TierClassPatchPath, tier }
        };

        try
        {
            await _dataAccess.UpdateMetadataAsync(cs, id, directUpdate, operationId);

            _logger.LogDebug("Metadata tier updated - Dataset: {DatasetId}, Tier: {Tier}, Duration: {DurationMs}ms",
                id, tier, stopwatch.ElapsedMilliseconds);
            return;
        }
        catch (CosmosException ex) when (ex.Message.Contains("no path found beyond: 'filemetadata'"))
        {
            // Expected case: filemetadata path doesn't exist yet, will create it below
            _logger.LogInformation("Creating filemetadata path for Dataset: {DatasetId}", id);
        }

        // Create filemetadata object with tier_class (path doesn't exist)
        var createPath = new Dictionary<string, object> {
            { FileMetadataPatchPath, new { tier_class = tier } }
        };

        try
        {
            await _dataAccess.UpdateMetadataAsync(cs, id, createPath, operationId);

            _logger.LogDebug("Metadata tier updated (created path) - Dataset: {DatasetId}, Tier: {Tier}, Duration: {DurationMs}ms",
                id, tier, stopwatch.ElapsedMilliseconds);
        }
        catch (CosmosException ex)
        {
            _logger.LogError(ex, "Metadata tier update failed - Dataset: {DatasetId}, Tier: {Tier}, StatusCode: {StatusCode}, Duration: {DurationMs}ms",
                id, tier, ex.StatusCode, stopwatch.ElapsedMilliseconds);
            throw;
        }
    }
}
