namespace Sidecar.Services
{
    public interface IDataAccess
    {
        Task Insert(string cs, Record? item);
        Task<Record> Get(string cs, string pk);
        Task Delete(string cs, string pk);
        Task<string> Query(string cs, string sql, string? ctoken, int? limit);
        Task<PaginatedRecordsPath> QueryPath(string cs, string sql, string? ctoken, int? limit);
    }
}
