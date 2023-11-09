namespace Sidecar.Common.TaskQueue;

using Sidecar.Common.Interface;
using Sidecar.Common.Model;
using System.Text.Json;

public class DeletionTaskJsonDeserializer : ITaskDeserializer<string, IDeletionOperationMessage>
{
    public IDeletionOperationMessage Deserialize(string task) => JsonSerializer.Deserialize<DeleteOperationMessage>(task)
        ?? throw new Exception($"Error deserializing task {task}");
}
