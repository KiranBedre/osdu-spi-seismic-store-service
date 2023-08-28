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
using Newtonsoft.Json;
using Sidecar.Common.Model;

public class DeleteItemsRetriever: IItemsRetriever
{
    private readonly IDataAccess DataAccess;
    private readonly IOptionsCosmos Options;

    public DeleteItemsRetriever(IDataAccess dataAccess, IOptionsCosmos options)
    {
        DataAccess = dataAccess;
        Options = options;
    }

    public async Task<List<DeleteItem?>?> GetItems(string subproject, string path)
    {
        var sql = $"SELECT c.id, c.data.gcsurl, c.data.path, c.data.name " +
            $"FROM c " +
            $"WHERE c.data.subproject = \"{subproject}\" " +
            $"AND startswith(c.data.path, \"{path}\", false) ";

        var cs = $"AccountEndpoint={Options.CosmosEndpoint};AccountKey={Options.CosmosKey};";
        var paginatedRecords = await DataAccess.GetRecords(cs, sql, null, null);

        if (paginatedRecords.records == null)
        {
            return null;
        }
        return paginatedRecords.records.Select(item =>
        {
            try
            {
                return JsonConvert.DeserializeObject<DeleteItem>(item.ToString());
            }
            catch (Exception)
            {
                return null; // Return default value if deserialization fails
            }
        }).Where(deserializedObject => deserializedObject != null) // Filter out failed deserializations
        .ToList();
    }
}
