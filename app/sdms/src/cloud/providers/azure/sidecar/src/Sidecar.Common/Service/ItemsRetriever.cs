using Sidecar.Common.Model;
using System.Net;

namespace Sidecar.Common.Service
{
    public class ItemsRetriever: IItemsRetriever<IOptionsCosmos>
    {
        private readonly IDataAccess DataAccess;
        private readonly Model.IOptionsCosmos Options;

        public ItemsRetriever(IDataAccess dataAccess, Model.IOptionsCosmos options)
        {
            DataAccess = dataAccess;
            Options = options;
        }

        public async Task<PaginatedRecords> GetItems(string subproject, string path)
        {
            var cs = $"AccountEndpoint={Options.CosmosEndpoint};AccountKey={Options.CosmosKey};";
            var sql = $"SELECT c.id, c.data.gcsurl FROM c WHERE c.data.subproject = \"{subproject}\" AND startswith(c.data.path, \"{path}\", false) ";
            return await DataAccess.GetRecords(cs, sql, null, null);
        }
    }
}
