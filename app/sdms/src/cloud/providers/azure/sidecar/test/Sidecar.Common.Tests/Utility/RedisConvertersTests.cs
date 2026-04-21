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

namespace Sidecar.Common.Tests.Utility;

using Sidecar.Common.Utility;

public class RedisConvertersTests
{

    private static DeleteOperationMessage GetDelOpMsg() => new()
    {
        OperationId = Guid.NewGuid().ToString(),
        Tenant = "tenant001",
        Subproject = "subproj007",
        Query = "SELECT c.id FROM c WHERE (c.data.subproject = @parameter)",
        Parameters = "[{\"name\":\"@parameter\",\"value\":\"subproject123\"}]\""
    };

    private static DeleteOperationStatus GetDelOpStatus() => new()
    {
        OperationId = Guid.NewGuid().ToString(),
        Tenant = "tenant001",
        Subproject = "subproj007",
        Query = "SELECT c.id FROM c",
        CompletedCnt = 123213,
        CreatedAt = DateTime.UtcNow,
        CreatedBy = "",
        DatasetsCnt = 0,
        FailedCnt = -1,
        LastUpdatedAt = DateTime.UtcNow,
    };

    private static HashEntry[] GetDelOpMsgHashEntry(DeleteOperationMessage msg, bool useJsonAttrNames = false) => [
            new(useJsonAttrNames?"operation_id":"OperationId", msg.OperationId),
            new(useJsonAttrNames?"tenant":"Tenant",msg.Tenant),
            new(useJsonAttrNames?"subproject":"Subproject",msg.Subproject),
            new(useJsonAttrNames?"query":"Query",msg.Query),
            new(useJsonAttrNames?"parameters":"Parameters",msg.Parameters),
        ];

    [Fact]
    public void Convert_FromMsg_ToHashEntry_Success()
    {
        // Arrange
        var msg = GetDelOpMsg();

        // Act
        var he = msg.ToHashEntries();

        // Assert
        _ = he.Should().NotBeEmpty()
            .And.HaveCount(6)
            .And.ContainSingle(h => h.Name == "OperationId" && h.Value == msg.OperationId)
            .And.ContainSingle(h => h.Name == "CreatedBy" && h.Value == msg.CreatedBy.ToString())
            .And.ContainSingle(h => h.Name == "Tenant" && h.Value == msg.Tenant)
            .And.ContainSingle(h => h.Name == "Subproject" && h.Value == msg.Subproject)
            .And.ContainSingle(h => h.Name == "Query" && h.Value == msg.Query)
            .And.ContainSingle(h => h.Name == "Parameters" && h.Value == msg.Parameters);
    }

    [Fact]
    public void Convert_FromMsg_ToHashEntry_UsingJsonAttrNames_Success()
    {
        // Arrange
        var msg = GetDelOpMsg();

        // Act
        var he = msg.ToHashEntries(true);

        // Assert
        _ = he.Should().NotBeEmpty()
            .And.HaveCount(6)
            .And.ContainSingle(h => h.Name == "operation_id" && h.Value == msg.OperationId)
            .And.ContainSingle(h => h.Name == "createdBy" && h.Value == msg.CreatedBy.ToString())
            .And.ContainSingle(h => h.Name == "tenant" && h.Value == msg.Tenant)
            .And.ContainSingle(h => h.Name == "subproject" && h.Value == msg.Subproject)
            .And.ContainSingle(h => h.Name == "query" && h.Value == msg.Query)
            .And.ContainSingle(h => h.Name == "parameters" && h.Value == msg.Parameters);
    }

    [Fact]
    public void Convert_FromHashEntry_ToDelOpMsg_Success()
    {
        // Arrange
        var expectedMsg = GetDelOpMsg();
        var he = GetDelOpMsgHashEntry(expectedMsg);

        // Act
        var msg = he.FromHashEntries<DeleteOperationMessage>();

        // Assert
        _ = msg.Should().BeEquivalentTo(expectedMsg);
    }

    [Fact]
    public void Convert_FromHashEntry_ToDelOpMsg_UsingJsonAttrNames_Success()
    {
        // Arrange
        var expectedMsg = GetDelOpMsg();
        var he = GetDelOpMsgHashEntry(expectedMsg, true);

        // Act
        var msg = he.FromHashEntries<DeleteOperationMessage>(true);

        // Assert
        _ = msg.Should().BeEquivalentTo(expectedMsg);
    }

    [Fact]
    public void Convert_ToHashEntryAndBack_ResultsIn_EquivalentValue()
    {
        // Arrange
        var status = GetDelOpStatus();

        // Act
        var convertedStatus = status.ToHashEntries().FromHashEntries<DeleteOperationStatus>();

        // Assert
        _ = convertedStatus.Should().BeEquivalentTo(status);
    }
}
