// ============================================================================
// Copyright 2017-2024, Schlumberger
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
using Interface;
using Model;
using Newtonsoft.Json;
using Microsoft.Extensions.Logging;

public class Cosmos : IDataAccess
{
    private const string DATABASE_ID = "sdms-db";
    private const string CONTAINER_ID = "data";
    private const int MAX_ITEM_COUNT = 1000;
    private const int MAX_CONCURRENCY = 32;

    private static readonly Dictionary<string, CosmosClient> _cosmosClients = new();
    private readonly ILogger<Cosmos> _logger;

    public Cosmos(ILogger<Cosmos> logger)
    {
        _logger = logger;
    }

    /// <param name="cs">Connection string for the target Cosmos instance</param>
    /// <param name="sql">SQL query to send to Cosmos</param>
    /// <param name="jsonParameters">JSON containing parameters for the sql query</param>
    /// <param name="ctoken">Continuation token</param>
    /// <param name="limit">Results limit</param>
    /// <returns>JSON containing results and new continuation token</returns>
    public async Task<string> QueryAsync(string cs, string sql, string? jsonParameters, string? ctoken, int? limit)
    {
        var paginatedRecords = await GetRecordsAsync(cs, sql, jsonParameters, ctoken, limit);
        return JsonConvert.SerializeObject(paginatedRecords);
    }

    public async Task<IPaginatedRecords> GetRecordsAsync(string cs, string sql, string? jsonParameters, string? ctoken, int? limit)
    {
        initCosmosClient(cs);
        var database = _cosmosClients[cs].GetDatabase(DATABASE_ID);
        var container = database.GetContainer(CONTAINER_ID);
        var records = new List<object>();
        var paginatedRecords = new PaginatedRecords();
        var options = GetQueryRequestOptions(limit);

        var query = new QueryDefinition(sql);
        var sqlParameters = extractParameters(jsonParameters);
        foreach (var parameter in sqlParameters)
        {
            _ = query.WithParameter(parameter.Name, parameter.Value);
        }

        var resultIterator = container.GetItemQueryIterator<object>(
            query,
            continuationToken: ctoken,
            requestOptions: options);

        if (ctoken == null && limit == null) // fetch all
        {
            while (resultIterator.HasMoreResults)
            {
                var results = await resultIterator.ReadNextAsync();
                foreach (var record in results)
                {
                    records.Add(record);
                }
            }
            paginatedRecords.continuationToken = null;
        }
        else // fetch exactly requested number of items, if available
        {
            var remainingItems = GetItemLimit(limit);
            while (remainingItems > 0 && resultIterator.HasMoreResults)
            {
                // fetch next page
                var results = await resultIterator.ReadNextAsync();
                foreach (var record in results)
                {
                    records.Add(record);
                }
                paginatedRecords.continuationToken = results.ContinuationToken;
                if (paginatedRecords.continuationToken == null)
                {
                    break;
                }

                remainingItems -= results.Count;

                // update the query iterator to return no more than the remaining number of items
                if (remainingItems > 0 && results.Count > 0)
                {
                    options = GetQueryRequestOptions(remainingItems);
                    resultIterator = container.GetItemQueryIterator<object>(
                        query,
                        continuationToken: results.ContinuationToken,
                        requestOptions: options);
                }
            }
        }
        paginatedRecords.records = records;
        return paginatedRecords;
    }

    private List<Parameter> extractParameters(string? jsonParameters)
    {
        if (jsonParameters == null)
        {
            return new();
        }

        try
        {
            var parameters = JsonConvert.DeserializeObject<List<Parameter>>(jsonParameters);
            return parameters ?? new();
        }
        catch (Exception ex)
        {
            _logger.LogError("Error parsing parameters: {0}", ex.Message);
            return new();
        }
    }

    public async Task<bool> DeleteMetadataAsync(string cs, string id)
    {
        initCosmosClient(cs);
        var database = _cosmosClients[cs].GetDatabase(DATABASE_ID);
        var container = database.GetContainer(CONTAINER_ID);
        var itemResponse = await container.DeleteItemAsync<object>(id, new PartitionKey(id));
        return itemResponse.StatusCode == System.Net.HttpStatusCode.NoContent;
    }

    public async Task<bool> UpdateMetadataAsync(string cs, string id, Dictionary<string, object> updates)
    {
        initCosmosClient(cs);
        var database = _cosmosClients[cs].GetDatabase(DATABASE_ID);
        var container = database.GetContainer(CONTAINER_ID);
        var patchOperations = new List<PatchOperation>();
        foreach (var pair in updates)
        {
            patchOperations.Add(PatchOperation.Replace(pair.Key, pair.Value));
        }
        var itemResponse = await container.PatchItemAsync<object>(
            id: id,
            partitionKey: new PartitionKey(id),
            patchOperations: patchOperations
        );
        return itemResponse.StatusCode == System.Net.HttpStatusCode.OK;
    }

    private QueryRequestOptions GetQueryRequestOptions(int? limit) =>
        new()
        {
            MaxItemCount = GetItemLimit(limit),
            // number of parallel tasks is min(MAX_CONCURRENCY, number of partitions that needs to be visited for answering a query)
            // https://learn.microsoft.com/en-us/azure/cosmos-db/nosql/performance-tips-query-sdk?tabs=v3&pivots=programming-language-csharp#tune-the-degree-of-parallelism
            MaxConcurrency = MAX_CONCURRENCY
        };

    private int GetItemLimit(int? limit) => limit is null or < 0 ? MAX_ITEM_COUNT : limit.Value;

    private static void initCosmosClient(string cs)
    {
        if (!_cosmosClients.ContainsKey(cs))
        {
            _cosmosClients.Add(cs, new CosmosClient(cs, new CosmosClientOptions()
            {
                SerializerOptions = new CosmosSerializationOptions()
                {
                    IgnoreNullValues = true
                },
                ConnectionMode = ConnectionMode.Direct,
            }));
        }
    }
}
