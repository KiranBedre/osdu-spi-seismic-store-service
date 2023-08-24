namespace Sidecar.Common.Service
{
    public interface IBulkDeletionWorker<TStorageOptions, TQueueOptions, TCosmosOptions> 
        where TStorageOptions : class
        where TQueueOptions : class
        where TCosmosOptions : class
    {
        Task RunBulkDeletion(string operationId, List<Object> items);
    }
}
