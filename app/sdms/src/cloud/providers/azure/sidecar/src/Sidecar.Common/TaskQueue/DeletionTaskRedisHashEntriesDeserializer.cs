namespace Sidecar.Common.TaskQueue;

using Sidecar.Common.Interface;
using Sidecar.Common.Model;
using Sidecar.Common.Utility;
using StackExchange.Redis;

public class DeletionTaskRedisHashEntriesDeserializer : ITaskDeserializer<HashEntry[], IDeletionOperationMessage>
{
    public IDeletionOperationMessage Deserialize(HashEntry[] task) =>
        task.FromHashEntries<DeleteOperationMessage>(true);
}
