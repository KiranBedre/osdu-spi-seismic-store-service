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
using System;
using System.Threading.Tasks;

using Interface;
using Microsoft.Extensions.Logging;

public class MetadataDeletionWorker : IMetadataDeletionWorker
{
    private readonly ILogger<MetadataDeletionWorker> Logger;
    private readonly IDataAccess DataAccess;
    private readonly ICosmosClientFactory _cosmosClientFactory;

    private int ConsecutiveFailures = 0;
    private const int MaxRetries = 5;

    public MetadataDeletionWorker(
        ILogger<MetadataDeletionWorker> logger, 
        IDataAccess dataAccess, 
        ICosmosClientFactory cosmosClientFactory)
    {
        Logger = logger;
        DataAccess = dataAccess;
        _cosmosClientFactory = cosmosClientFactory;
    }

    public async Task DeleteMetadata(string dataPartitionId, string id)
    {
        bool success = false;
        do
        {
            try
            {
                var cs = await _cosmosClientFactory.GetCosmosConnectionString(dataPartitionId);
                success = await DataAccess.DeleteMetadata(cs, id);
                ConsecutiveFailures = 0;
            }
            catch (CosmosException ex)
            {
                ConsecutiveFailures++;
                Logger.LogWarning($"Could not delete metadata for dataset {id}, Attempt {ConsecutiveFailures}/{MaxRetries} ");
                if (ConsecutiveFailures == MaxRetries) 
                { 
                    throw ex; 
                }
            }
        } while (!success && ConsecutiveFailures < MaxRetries);
    }
}
