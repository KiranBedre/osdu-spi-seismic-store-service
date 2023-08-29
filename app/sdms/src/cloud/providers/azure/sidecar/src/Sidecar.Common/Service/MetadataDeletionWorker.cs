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

public class MetadataDeletionWorker : IMetadataDeletionWorker
{
    private readonly IDataAccess _dataAccess;
    private readonly ICosmosClientFactory _cosmosClientFactory;

    private int _consecutiveFailures = 0;
    private const int MAX_RETRIES = 5;

    public MetadataDeletionWorker(IDataAccess dataAccess, ICosmosClientFactory cosmosClientFactory)
    {
        _dataAccess = dataAccess;
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
                success = await _dataAccess.DeleteMetadata(cs, id);
                _consecutiveFailures = 0;
            }
            catch (CosmosException ex)
            {
                _consecutiveFailures++;
                Console.WriteLine(ex.Message);
            }
        } while (!success && _consecutiveFailures < MAX_RETRIES);
    }
}
