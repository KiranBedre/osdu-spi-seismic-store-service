namespace Sidecar.Common.Service
{
    public interface IMetadataDeletionWorker<TOptions> where TOptions : class
    {
        Task DeleteMetadata(string id);
    }
}
