namespace Sidecar.Common.Interface;

public interface ITaskExecutor<T>
{
    Task ProcessAsync(T task, CancellationToken ct);
}
