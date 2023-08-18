// ============================================================================
// Copyright 2017-2023, Schlumberger
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

using Microsoft.Azure.Cosmos;
using Newtonsoft.Json;

namespace Sidecar.Services
{
    public class Cosmos : IDataAccess
    {
        private readonly string databaseId = "sdms-db";
        private readonly string containerId = "data";
        private static Dictionary<string, CosmosClient> cosmosClients = new Dictionary<string, CosmosClient>();

        public async Task<string> Query(string cs, string sql, string? ctoken, int? limit)
        {
            this.initCosmosClient(cs);
            Database database = Cosmos.cosmosClients[cs].GetDatabase(this.databaseId);
            Container container = database.GetContainer(this.containerId);
            List<Object> records = new List<Object>();
            QueryRequestOptions options = new QueryRequestOptions()
            {
                // MaxItemCount set to -1 lets CosmosDB decide on the optimal returned item count
                // https://learn.microsoft.com/en-us/azure/cosmos-db/nosql/performance-tips-query-sdk?tabs=v2&pivots=programming-language-csharp#tune-the-page-size
                MaxItemCount = limit ?? -1,
                // number of parallel tasks is min(32, number of partitions that needs to be visited for answering a query)
                // https://learn.microsoft.com/en-us/azure/cosmos-db/nosql/performance-tips-query-sdk?tabs=v3&pivots=programming-language-csharp#tune-the-degree-of-parallelism
                MaxConcurrency = 32 
            };
            FeedIterator<Object> query = container.GetItemQueryIterator<Object>(
                sql,
                continuationToken: ctoken,
                requestOptions: options);
            if (ctoken == null && limit == null) // fetch all
            {
                while (query.HasMoreResults)
                {
                    var results = await query.ReadNextAsync();
                    foreach (Object record in results)
                    {
                        records.Add(record);
                    }
                }
                PaginatedRecords paginatedRecords = new PaginatedRecords();
                paginatedRecords.records = records;
                paginatedRecords.continuationToken = null;
                return JsonConvert.SerializeObject(paginatedRecords);
            }
            else // fetch next page
            {
                var results = await query.ReadNextAsync();
                foreach (Object record in results)
                {
                    records.Add(record);
                }
                PaginatedRecords paginatedRecords = new PaginatedRecords();
                paginatedRecords.records = records;
                paginatedRecords.continuationToken = results.ContinuationToken;
                return JsonConvert.SerializeObject(paginatedRecords);
            }
        }

        private void initCosmosClient(string cs)
        {
            if (!Cosmos.cosmosClients.ContainsKey(cs))
            {
                Cosmos.cosmosClients[cs] = new CosmosClient(cs, new CosmosClientOptions()
                {
                    SerializerOptions = new CosmosSerializationOptions()
                    {
                        IgnoreNullValues = true
                    },
                    ConnectionMode = ConnectionMode.Direct,
                });
            }
        }
    }
}
