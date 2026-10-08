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

namespace Sidecar.Common.Service;

using Microsoft.Azure.Cosmos;
using System.Threading.Tasks;

using Interface;
using Microsoft.Extensions.Logging;

public class MetadataTierUpdater(
    ILogger<MetadataTierUpdater> logger,
    IDataAccess dataAccess,
    ICosmosClientFactory cosmosClientFactory) : IMetadataTierUpdater
{
    private readonly ILogger<MetadataTierUpdater> _logger = logger;
    private readonly IDataAccess _dataAccess = dataAccess;
    private readonly ICosmosClientFactory _cosmosClientFactory = cosmosClientFactory;

    private int _consecutiveFailures = 0;
    private const int MAX_RETRIES = 5;

    public async Task UpdateTier(string dataPartitionId, string id, string tier)
    {
        var success = false;
        do
        {
            try
            {
                var cs = await _cosmosClientFactory.GetCosmosConnectionStringAsync(dataPartitionId);

                var updates = new Dictionary<string, object> {
                    {
                        "/data/filemetadata/tier_class", tier
                    }
                };
                success = await _dataAccess.UpdateMetadataAsync(cs, id, updates);
                _consecutiveFailures = 0;
            }
            catch (CosmosException ex)
            {
                if (ex.Message.Contains("no path found beyond: 'filemetadata'"))
                {
                    try
                    {
                        var cs = await _cosmosClientFactory.GetCosmosConnectionStringAsync(dataPartitionId);
                        var updates = new Dictionary<string, object> {
                            {
                                "/data/filemetadata", new {}
                            }
                        };
                        var res = await _dataAccess.UpdateMetadataAsync(cs, id, updates);
                    }
                    catch (CosmosException exception)
                    {
                        _logger.LogWarning("Could not process metadata for dataset {id}, with exception {ex}", id, exception);
                        throw ex;
                    }
                }
                _consecutiveFailures++;
                _logger.LogWarning("Could not process metadata for dataset {id}, Attempt {a}", id, _consecutiveFailures / MAX_RETRIES);
                if (_consecutiveFailures == MAX_RETRIES)
                {
                    _logger.LogWarning("Could not process metadata for dataset {id}, with exception {ex}", id, ex);
                    throw;
                }
            }
        } while (!success && _consecutiveFailures < MAX_RETRIES);
    }
}
