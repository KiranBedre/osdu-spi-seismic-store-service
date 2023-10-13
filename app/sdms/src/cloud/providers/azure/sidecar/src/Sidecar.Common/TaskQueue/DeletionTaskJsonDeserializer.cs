namespace Sidecar.Common.TaskQueue;

using Newtonsoft.Json;
using Sidecar.Common.Interface;
using Sidecar.Common.Model;

public class DeletionTaskJsonDeserializer : ITaskDeserializer<string, IDeletionOperationMessage>
{
    public IDeletionOperationMessage Deserialize(string task) => JsonConvert.DeserializeObject<DeleteOperationMessage>(task);
}
