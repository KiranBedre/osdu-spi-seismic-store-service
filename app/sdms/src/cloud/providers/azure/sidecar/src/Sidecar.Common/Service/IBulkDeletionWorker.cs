namespace Sidecar.Common.Service
{
    public interface IBulkDeletionWorker<TOptions> where TOptions : class
    {
        Task RunBulkDeletion(List<Object> items);
    }
}
