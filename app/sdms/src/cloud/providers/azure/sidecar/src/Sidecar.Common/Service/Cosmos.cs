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

namespace Sidecar.Common.Service;

using Microsoft.Azure.Cosmos;
using Newtonsoft.Json;

using Interface;
using Model;

public class Cosmos : IDataAccess
{
    private const string DATABASE_ID = "sdms-db";
    private const string CONTAINER_ID = "data";
    private static readonly Dictionary<string, CosmosClient> _cosmosClients = new Dictionary<string, CosmosClient>();

    public async Task<string> Query(string cs, string sql, string? ctoken, int? limit)
    {
        IPaginatedRecords paginatedRecords = await GetRecords(cs, sql, ctoken, limit);
        return JsonConvert.SerializeObject(paginatedRecords);
    }

    public async Task<IPaginatedRecords> GetRecords(string cs, string sql, string? ctoken, int? limit)
    {
        this.initCosmosClient(cs);
        Database database = Cosmos._cosmosClients[cs].GetDatabase(DATABASE_ID);
        Container container = database.GetContainer(CONTAINER_ID);
        List<Object> records = new List<Object>();
        IPaginatedRecords paginatedRecords = new PaginatedRecords();
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
            paginatedRecords.continuationToken = null;
        }
        else // fetch next page
        {
            var results = await query.ReadNextAsync();
            foreach (Object record in results)
            {
                records.Add(record);
            }
            paginatedRecords.continuationToken = results.ContinuationToken;

        }
        paginatedRecords.records = records;
        return paginatedRecords;
    }

    public async Task<bool> DeleteMetadata(string cs, string id)
    {
        this.initCosmosClient(cs);
        Database database = Cosmos._cosmosClients[cs].GetDatabase(DATABASE_ID);
        Container container = database.GetContainer(CONTAINER_ID);
        var itemResponse = await container.DeleteItemAsync<Object>(id, new PartitionKey(id));
        return itemResponse.StatusCode == System.Net.HttpStatusCode.NoContent;
    }

    private void initCosmosClient(string cs)
    {
        if (!Cosmos._cosmosClients.ContainsKey(cs))
        {
            Cosmos._cosmosClients[cs] = new CosmosClient(cs, new CosmosClientOptions()
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
