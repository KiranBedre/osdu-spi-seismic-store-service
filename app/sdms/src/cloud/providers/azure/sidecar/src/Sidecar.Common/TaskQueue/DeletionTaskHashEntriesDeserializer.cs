namespace Sidecar.Common.TaskQueue;

using Sidecar.Common.Interface;
using Sidecar.Common.Model;
using Sidecar.Common.Utility;
using StackExchange.Redis;

public class DeletionTaskHashEntriesDeserializer : ITaskDeserializer<HashEntry[], IDeletionOperationMessage>
{
    public IDeletionOperationMessage Deserialize(HashEntry[] task)
    {
        return task.FromHashEntries<DeleteOperationMessage>(true);
    }
}
