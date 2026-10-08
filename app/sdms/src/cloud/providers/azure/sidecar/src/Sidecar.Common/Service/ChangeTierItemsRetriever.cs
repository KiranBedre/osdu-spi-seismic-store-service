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
using System.Text.Json;
using Sidecar.Common.Model;

#pragma warning disable CS8619 // Nullability of reference types in value doesn't match target type
#pragma warning disable CS8604 // Possible null reference argument for parameter.

public class ChangeTierItemsRetriever(
    IDataAccess dataAccess,
    ICosmosClientFactory cosmosClientFactory) : IChangeTierItemsRetriever
{
    private readonly IDataAccess _dataAccess = dataAccess;
    private readonly ICosmosClientFactory _cosmosClientFactory = cosmosClientFactory;

    public async Task<(List<ChangeTierItem>?, string?)> GetItemsAsync(string dataPartitionId, string query, string? parameters, string? continuationToken, CancellationToken ct = default)
    {
        var cs = await _cosmosClientFactory.GetCosmosConnectionEndpointAsync(dataPartitionId, ct);

        var paginatedRecords = await _dataAccess.GetRecordsAsync(cs, query, parameters, continuationToken, -1);

        var items = paginatedRecords.records.Select(item =>
        {
            try
            {
                return JsonSerializer.Deserialize<ChangeTierItem>(item.ToString());
            }
            catch (Exception)
            {
                return null;
            }
        }).Where(deserializedObject => deserializedObject != null) // Filter out failed deserialization
        .ToList();
        return (items, paginatedRecords.continuationToken);
    }
}
