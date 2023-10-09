namespace Sidecar.Common.Interface;

public interface ITaskExecutor<T>
{
    Task Process(T task, CancellationToken ct);
}
