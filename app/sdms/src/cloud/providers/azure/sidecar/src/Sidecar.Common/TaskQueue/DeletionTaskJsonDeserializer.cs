namespace Sidecar.Common.TaskQueue;

using Sidecar.Common.Interface;
using Sidecar.Common.Model;
using System.Text.Json;

public class DeletionTaskJsonDeserializer : ITaskDeserializer<string, IDeletionOperationMessage>
{
    public IDeletionOperationMessage Deserialize(string task)
    {
        var deleteOperationMessage = JsonSerializer.Deserialize<DeleteOperationMessage>(task) ??
            throw new InvalidOperationException($"Failed to deserialize delete operation message {task}");

        return deleteOperationMessage;
    }
}
