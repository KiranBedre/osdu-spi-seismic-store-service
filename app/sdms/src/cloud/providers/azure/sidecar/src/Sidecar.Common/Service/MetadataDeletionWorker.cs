using Microsoft.Azure.Cosmos;
using Sidecar.Common.Model;
using System;
using System.Collections.Generic;
using System.Drawing.Printing;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Sidecar.Common.Service
{
    public class MetadataDeletionWorker : IMetadataDeletionWorker<IOptionsCosmos>
    {
        private readonly IDataAccess DataAccess;
        private readonly Model.IOptionsCosmos Options;

        private int ConsecutiveFailures = 0;
        private const int MaxRetries = 5;
        
        public MetadataDeletionWorker(IDataAccess dataAccess, Model.IOptionsCosmos options)
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
}
