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

using Interface;
using Microsoft.Extensions.Logging;
using System.Text.Json;
using Sidecar.Common.Model;

#pragma warning disable CS8619 // Nullability of reference types in value doesn't match target type
#pragma warning disable CS8604 // Possible null reference argument for parameter.

public class DeleteItemsRetriever: IItemsRetriever
{
    private readonly ILogger<DeleteItemsRetriever> Logger;
    private readonly IDataAccess DataAccess;
    private readonly ICosmosClientFactory _cosmosClientFactory;

    public DeleteItemsRetriever(
        ILogger<DeleteItemsRetriever> logger,
        IDataAccess dataAccess,
        ICosmosClientFactory cosmosClientFactory)
    {
        Logger = logger;
        DataAccess = dataAccess;
        _cosmosClientFactory = cosmosClientFactory;
    }

    public async Task<List<DeleteItem>?> GetItems(string dataPartitionId, string subproject, string path, CancellationToken ct = default)
    {
        var sql = $"SELECT c.id, c.data.gcsurl, c.data.path, c.data.name " +
            $"FROM c " +
            $"WHERE c.data.subproject = \"{subproject}\" " +
            $"AND startswith(c.data.path, \"{path}\", false) ";

        var cs = await _cosmosClientFactory.GetCosmosConnectionString(dataPartitionId, ct);

        var paginatedRecords = await DataAccess.GetRecords(cs, sql, null, null);

        return paginatedRecords.records.Select(item =>
        {
            try
            {
                return JsonSerializer.Deserialize<DeleteItem>(item.ToString());
            }
            catch (Exception)
            {
                return null;
            }
        }).Where(deserializedObject => deserializedObject != null) // Filter out failed deserializations
        .ToList();
    }
}
