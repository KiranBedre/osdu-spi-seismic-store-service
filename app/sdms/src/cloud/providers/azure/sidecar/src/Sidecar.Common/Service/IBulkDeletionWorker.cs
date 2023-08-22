namespace Sidecar.Common.Service
{
    public interface IBulkDeletionWorker<TStorageOptions, TCosmosOptions> 
        where TStorageOptions : class
        where TCosmosOptions : class
    {
        Task RunBulkDeletion(List<Object> items);
    }
}
