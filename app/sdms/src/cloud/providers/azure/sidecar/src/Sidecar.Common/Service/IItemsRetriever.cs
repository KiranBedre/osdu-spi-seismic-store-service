using Sidecar.Common.Model;

namespace Sidecar.Common.Service
{
    public interface IItemsRetriever<TOptions> where TOptions : class
    {
        Task<PaginatedRecords> GetItems(string subproject, string path);
    }
}
