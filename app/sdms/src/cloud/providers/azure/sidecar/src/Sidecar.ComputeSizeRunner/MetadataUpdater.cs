// ============================================================================
// Copyright 2017-2023, Microsoft
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

namespace Sidecar.ComputeSizeRunner;

using Microsoft.Azure.Cosmos;
using Microsoft.Extensions.Logging;

public class MetadataUpdater(ILogger<MetadataUpdater> logger, IDataAccess dataAccess, ICosmosClientFactory cosmosClientFactory, IDateFormatter dateFormatter) : IMetadataUpdater
{

    private int _consecutiveFailures;
    private const int MAX_RETRIES = 2;

    private readonly ILogger<MetadataUpdater> _logger = logger;
    private readonly IDataAccess _dataAccess = dataAccess;
    private readonly ICosmosClientFactory _cosmosClientFactory = cosmosClientFactory;
    private readonly IDateFormatter _dateFormatter = dateFormatter;

    public async Task UpdateComputeSize(string dataPartitionId, string metadataId, long size, CancellationToken cancellationToken)
    {
        var updates = new Dictionary<string, object>
        {
            {
                "/data/computed_size", size
            },
            {
                "/data/computed_size_date", _dateFormatter.FormatDate(DateTime.Now)
            }
        };
        await UpdateMetadataAsync(dataPartitionId, metadataId, updates, cancellationToken);
    }

    private async Task UpdateMetadataAsync(string dataPartitionId, string metadataId, Dictionary<string, object> updates, CancellationToken cancellationToken)
    {
        do
        {
            try
            {
                var cs = await _cosmosClientFactory.GetCosmosConnectionStringAsync(dataPartitionId, cancellationToken);
                _ = await _dataAccess.UpdateMetadataAsync(cs, metadataId, updates);
                _consecutiveFailures = 0;
            }
            catch (CosmosException)
            {
                _consecutiveFailures++;
                _logger.LogWarning("Could not update metadata for dataset {id}, Attempt {a}", metadataId, _consecutiveFailures / MAX_RETRIES);
                if (_consecutiveFailures == MAX_RETRIES)
                {
                    throw;
                }
            }
        } while (_consecutiveFailures > 0);
    }
}
