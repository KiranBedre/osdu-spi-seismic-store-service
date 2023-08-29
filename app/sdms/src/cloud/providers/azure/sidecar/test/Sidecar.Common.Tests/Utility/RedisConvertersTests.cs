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

namespace Sidecar.Common.Tests;

using Sidecar.Common.Utility;

public class RedisConvertersTests
{

    private DeleteOperationMessage GetDelOpMsg(){
        return new DeleteOperationMessage{
            OperationId = Guid.NewGuid().ToString(),
            Tenant = "tenant001",
            Subproject = "subproj007",
            Path = "tenant001/proj001/subproj007/"
        };
    }

    private HashEntry[] GetDelOpMsgHashEntry(DeleteOperationMessage msg, bool useJsonAttrNames = false){
       return new HashEntry[]{
            new HashEntry(useJsonAttrNames?"operation_id":"OperationId", msg.OperationId),
            new HashEntry(useJsonAttrNames?"tenant":"Tenant",msg.Tenant),
            new HashEntry(useJsonAttrNames?"subproject":"Subproject",msg.Subproject),
            new HashEntry(useJsonAttrNames?"path":"Path",msg.Path)
        };
    }

    [Fact]
    public void Convert_FromMsg_ToHashEntry_Success(){
        // Arrange
        var msg = GetDelOpMsg();

        // Act
        var he = msg.ToHashEntries();

        // Assert
        he.Should().NotBeEmpty()
            .And.HaveCount(4)
            .And.ContainSingle(h => h.Name == "OperationId" && h.Value == msg.OperationId)
            .And.ContainSingle(h => h.Name == "Tenant" && h.Value == msg.Tenant)
            .And.ContainSingle(h => h.Name == "Subproject" && h.Value == msg.Subproject)
            .And.ContainSingle(h => h.Name == "Path" && h.Value == msg.Path);
    }

    [Fact]
    public void Convert_FromMsg_ToHashEntry_UsingJsonAttrNames_Success(){
        // Arrange
        var msg = GetDelOpMsg();

        // Act
        var he = msg.ToHashEntries(true);

        // Assert
        he.Should().NotBeEmpty()
            .And.HaveCount(4)
            .And.ContainSingle(h => h.Name == "operation_id" && h.Value == msg.OperationId)
            .And.ContainSingle(h => h.Name == "tenant" && h.Value == msg.Tenant)
            .And.ContainSingle(h => h.Name == "subproject" && h.Value == msg.Subproject)
            .And.ContainSingle(h => h.Name == "path" && h.Value == msg.Path);
    }

    [Fact]
    public void Convert_FromHashEntry_ToDelOpMsg_Success(){
        // Arrange
        var expectedMsg = GetDelOpMsg();
        var he = GetDelOpMsgHashEntry(expectedMsg);

        // Act
        var msg = he.FromHashEntries<DeleteOperationMessage>();

        // Assert
        msg.Should().BeEquivalentTo(expectedMsg);
    }

    [Fact]
    public void Convert_FromHashEntry_ToDelOpMsg_UsingJsonAttrNames_Success(){
        // Arrange
        var expectedMsg = GetDelOpMsg();
        var he = GetDelOpMsgHashEntry(expectedMsg, true);

        // Act
        var msg = he.FromHashEntries<DeleteOperationMessage>(true);

        // Assert
        msg.Should().BeEquivalentTo(expectedMsg);
    }

}