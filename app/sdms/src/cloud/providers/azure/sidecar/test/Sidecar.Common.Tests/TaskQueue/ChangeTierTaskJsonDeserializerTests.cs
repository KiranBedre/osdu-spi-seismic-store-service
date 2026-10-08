// ============================================================================
// Copyright 2017-2023, Microsoft
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

namespace Sidecar.Common.Tests.TaskQueue;

using Sidecar.Common.TaskQueue;
using System.Text.Json;

public class ChangeTierTaskJsonDeserializerTests
{
    [Fact]
    public void Deserialize_ValidTask_ReturnsChangeTierOperationMessage()
    {
        // Arrange
        var task = /*lang=json,strict*/ "{\"operation_id\":\"123\",\"createdBy\":\"test\",\"tenant\":\"tenant1\",\"subproject\":\"subproject1\",\"tier\":\"tier1\",\"query\":\"query1\",\"parameters\":\"parameters1\"}";
        var deserializer = new ChangeTierTaskJsonDeserializer();

        // Act
        var result = deserializer.Deserialize(task);

        // Assert
        Assert.NotNull(result);
        _ = Assert.IsType<ChangeTierOperationMessage>(result);
        Assert.Equal("123", result.OperationId);
        Assert.Equal("test", result.CreatedBy);
        Assert.Equal("tenant1", result.Tenant);
        Assert.Equal("subproject1", result.Subproject);
        Assert.Equal("query1", result.Query);
        Assert.Equal("parameters1", result.Parameters);
    }

    [Fact]
    public void Deserialize_InvalidTask_ThrowsJsonException()
    {
        // Arrange
        var task = "invalid task";
        var deserializer = new ChangeTierTaskJsonDeserializer();

        // Act & Assert
        _ = Assert.Throws<JsonException>(() => deserializer.Deserialize(task));
    }
}
