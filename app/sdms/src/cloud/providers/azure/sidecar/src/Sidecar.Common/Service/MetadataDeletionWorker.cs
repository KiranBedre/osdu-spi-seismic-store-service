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
using System.Threading.Tasks;

using Interface;
using Microsoft.Extensions.Logging;

public class MetadataDeletionWorker : IMetadataDeletionWorker
{
    private readonly ILogger<MetadataDeletionWorker> _logger;
    private readonly IDataAccess _dataAccess;
    private readonly ICosmosClientFactory _cosmosClientFactory;
    private readonly IArchiveService _archiveService;

    private const int MAX_RETRIES = 5;

    public MetadataDeletionWorker(
        ILogger<MetadataDeletionWorker> logger,
        IDataAccess dataAccess,
        ICosmosClientFactory cosmosClientFactory,
        IArchiveService archiveService)
    {
        _logger = logger;
        _dataAccess = dataAccess;
        _cosmosClientFactory = cosmosClientFactory;
        _archiveService = archiveService;
    }

    public async Task DeleteMetadataAsync(string dataPartitionId, string id)
    {
        // Archive current state before deletion
        await _archiveService.ArchiveBeforeDeleteAsync(dataPartitionId, id);

        for (var attempt = 1; attempt <= MAX_RETRIES; attempt++)
        {
            try
            {
                var cs = await _cosmosClientFactory.GetCosmosConnectionEndpointAsync(dataPartitionId);
                if (await _dataAccess.DeleteMetadataAsync(cs, id, null))
                {
                    return;
                }
            }
            catch (CosmosException ex) when (attempt < MAX_RETRIES)
            {
                _logger.LogWarning(
                    ex,
                    "Could not delete metadata for dataset {DatasetId}, attempt {Attempt}/{MaxRetries}",
                    id,
                    attempt,
                    MAX_RETRIES);
            }
        }

        throw new InvalidOperationException(
            $"Metadata deletion exhausted {MAX_RETRIES} attempts without an exception.");
    }
}
