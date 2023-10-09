namespace Sidecar.Common.Interface;

public interface ITaskDeserializer<T, K>
{
    public K Deserialize(T task);
}
