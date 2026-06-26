// ============================================================================
// Copyright 2026, Microsoft
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
// ============================================================================

namespace Sidecar.Common.TaskQueue;

using System.Text.Json;
using Sidecar.Common.Interface;
using Sidecar.Common.Model;

public class RestoreJsonDeserializer : ITaskDeserializer<string, IRestoreOperationMessage>
{
    public IRestoreOperationMessage Deserialize(string task) =>
        JsonSerializer.Deserialize<RestoreOperationMessage>(task)
            ?? throw new Exception($"Error deserializing restore task: {task}");
}
