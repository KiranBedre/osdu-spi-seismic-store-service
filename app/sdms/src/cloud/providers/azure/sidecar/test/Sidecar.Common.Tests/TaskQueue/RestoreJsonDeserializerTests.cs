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

namespace Sidecar.Common.Tests.TaskQueue;

using Sidecar.Common.TaskQueue;
using System.Text.Json;

/// <summary>
/// Coverage for <see cref="RestoreJsonDeserializer"/> — the seam that turns the raw restore
/// queue-message payload (a JSON string) into a strongly typed <see cref="IRestoreOperationMessage"/>
/// before the executor runs. Verifies field binding (incl. the snake_case <c>operation_id</c>
/// property name), optional-field handling, and the failure modes for malformed or incomplete
/// payloads.
/// </summary>
public class RestoreJsonDeserializerTests
{
    private const string ValidTask =
        /*lang=json,strict*/
        "{\"operation_id\":\"op-123\",\"createdBy\":\"user@example.com\",\"sdPath\":\"sd://tenant1/subproject1/pathA/dataset1\",\"restorePointInTime\":\"2026-06-01T00:00:00Z\",\"correlationId\":\"corr-9\"}";

    [Fact]
    public void Deserialize_ValidTask_ReturnsRestoreOperationMessage()
    {
        var deserializer = new RestoreJsonDeserializer();

        var result = deserializer.Deserialize(ValidTask);

        _ = result.Should().NotBeNull();
        _ = result.Should().BeOfType<RestoreOperationMessage>();
        _ = result.OperationId.Should().Be("op-123");
        _ = result.CreatedBy.Should().Be("user@example.com");
        _ = result.SdPath.Should().Be("sd://tenant1/subproject1/pathA/dataset1");
        _ = result.RestorePointInTime.Should().Be("2026-06-01T00:00:00Z");
        _ = result.CorrelationId.Should().Be("corr-9");
    }

    [Fact]
    public void Deserialize_MissingOptionalCorrelationId_Succeeds()
    {
        var task =
            /*lang=json,strict*/
            "{\"operation_id\":\"op-123\",\"createdBy\":\"user@example.com\",\"sdPath\":\"sd://t/s/p/d\",\"restorePointInTime\":\"2026-06-01T00:00:00Z\"}";
        var deserializer = new RestoreJsonDeserializer();

        var result = deserializer.Deserialize(task);

        _ = result.OperationId.Should().Be("op-123");
        _ = result.CorrelationId.Should().BeNull();
    }

    [Fact]
    public void Deserialize_InvalidJson_ThrowsJsonException()
    {
        var deserializer = new RestoreJsonDeserializer();

        var act = () => deserializer.Deserialize("not valid json");

        _ = act.Should().Throw<JsonException>();
    }

    [Theory]
    [InlineData(/*lang=json,strict*/ "{\"createdBy\":\"u\",\"sdPath\":\"sd://t/s/p/d\",\"restorePointInTime\":\"2026-06-01T00:00:00Z\"}")] // no operation_id
    [InlineData(/*lang=json,strict*/ "{\"operation_id\":\"op-1\",\"createdBy\":\"u\",\"restorePointInTime\":\"2026-06-01T00:00:00Z\"}")]   // no sdPath
    [InlineData(/*lang=json,strict*/ "{\"operation_id\":\"op-1\",\"createdBy\":\"u\",\"sdPath\":\"sd://t/s/p/d\"}")]                        // no restorePointInTime
    public void Deserialize_MissingRequiredField_ThrowsJsonException(string task)
    {
        var deserializer = new RestoreJsonDeserializer();

        var act = () => deserializer.Deserialize(task);

        // System.Text.Json surfaces [JsonRequired] violations as JsonException.
        _ = act.Should().Throw<JsonException>();
    }

    [Fact]
    public void Deserialize_JsonNullLiteral_ThrowsWithTaskInMessage()
    {
        var deserializer = new RestoreJsonDeserializer();

        // A literal "null" payload deserializes to a null message; the deserializer converts that
        // into an explicit error rather than returning null.
        var act = () => deserializer.Deserialize("null");

        _ = act.Should().Throw<Exception>().WithMessage("*Error deserializing restore task*");
    }
}
