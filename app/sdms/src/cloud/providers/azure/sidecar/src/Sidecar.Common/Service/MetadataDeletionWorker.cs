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

public class MetadataDeletionWorker : IMetadataDeletionWorker<IOptionsCosmos>
{
    private readonly IDataAccess DataAccess;
    private readonly IOptionsCosmos Options;

    private int ConsecutiveFailures = 0;
    private const int MaxRetries = 5;

    public MetadataDeletionWorker(IDataAccess dataAccess, IOptionsCosmos options)
    {
        DataAccess = dataAccess;
        Options = options;
    }

    public async Task DeleteMetadata(string id)
    {
        var cs = $"AccountEndpoint={Options.CosmosEndpoint};AccountKey={Options.CosmosKey};";
        bool success = false;
        do
        {
            try
            {
                success = await DataAccess.DeleteMetadata(cs, id);
                ConsecutiveFailures = 0;
            }
            catch (CosmosException ex)
            {
                ConsecutiveFailures++;
                Console.WriteLine(ex.Message);
            }
        } while (!success && ConsecutiveFailures < MaxRetries);
    }

}