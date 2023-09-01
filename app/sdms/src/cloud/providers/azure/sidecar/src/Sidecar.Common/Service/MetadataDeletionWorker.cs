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

public class MetadataDeletionWorker : IMetadataDeletionWorker
{
    private readonly ILogger<MetadataDeletionWorker> _logger;
    private readonly IDataAccess _dataAccess;
    private readonly ICosmosClientFactory _cosmosClientFactory;

    private int _consecutiveFailures = 0;
    private const int MAX_RETRIES = 5;

    public MetadataDeletionWorker(
        ILogger<MetadataDeletionWorker> logger,
        IDataAccess dataAccess,
        ICosmosClientFactory cosmosClientFactory)
    {
        _logger = logger;
        _dataAccess = dataAccess;
        _cosmosClientFactory = cosmosClientFactory;
    }

    public async Task DeleteMetadataAsync(string dataPartitionId, string id)
    {
        var success = false;
        do
        {
            try
            {
                var cs = await _cosmosClientFactory.GetCosmosConnectionStringAsync(dataPartitionId);
                success = await _dataAccess.DeleteMetadataAsync(cs, id);
                _consecutiveFailures = 0;
            }
            catch (CosmosException ex)
            {
                _consecutiveFailures++;
                _logger.LogWarning($"Could not delete metadata for dataset {id}, Attempt {_consecutiveFailures}/{MAX_RETRIES} ");
                if (_consecutiveFailures == MAX_RETRIES)
                {
                    throw ex;
                }
            }
        } while (!success && _consecutiveFailures < MAX_RETRIES);
    }
}
