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

#pragma warning disable IDE0022
#pragma warning disable IDE0200

namespace Sidecar.Common.Tests.Service;

public class RedisDeletionTasksStorageTests : RedisHandlerTests
{
    private const string QUEUE_NAME = "somequeue";
    private readonly RedisDeletionTasksStorage _queue;

    public RedisDeletionTasksStorageTests()
    {
        _ = RedisConnectionFactory
            .Setup(m => m.GetRedisForQueue())
            .Returns(
                new RedisHandler(
                    TestingHelpers.GetLogger<RedisHandler>().Object,
                    ConnectionMultiplexer.Object
            ));

        _queue = new(
            TestingHelpers.GetLogger<RedisDeletionTasksStorage>().Object,
            new Options { QueueName = QUEUE_NAME },
            RedisConnectionFactory.Object);
    }

    private async Task<DeleteOperationMessage> PushDeleteOperationMessage()
    {
        var expectedMsg = TestingHelpers.GetDelOpMsg();
        //-- The queue is a List, make sure it exists and push the operation id

        _ = await DbMock.Object.ListLeftPushAsync(QUEUE_NAME, expectedMsg.OperationId);

        //---add the id to the queue of del operations
        var hashEntries = TestingHelpers.GetDelOpMsgHashEntry(expectedMsg, true);

        //---add the del operations payload to the queue
        var key = QUEUE_NAME + ":" + expectedMsg.OperationId;
        DbMock.Object.HashSet(new(key), hashEntries);

        return expectedMsg;
    }

    [Fact]
    public async Task CheckForDeletionOperationAsync_QueueIsEmpty_ReturnsNull()
    {
        // Arrange
        _ = await PushDeleteOperationMessage();

        // Act
        _ = await _queue.CheckForDeletionOperationAsync();
        var statusMsg = await _queue.CheckForDeletionOperationAsync();

        // Assert
        Assert.Null(statusMsg);
    }

    [Fact]
    private async Task CheckForDeletionOperationAsync_Success()
    {
        // Arrange
        var expectedMsg = await PushDeleteOperationMessage();

        // Act
        var statusMsg = await _queue.CheckForDeletionOperationAsync();

        // Assert
        _ = statusMsg.Should()
            .NotBeNull();

        _ = statusMsg!.OperationId
            .Should()
            .Be(expectedMsg.OperationId);
        _ = statusMsg!.Type
            .Should()
            .Be(expectedMsg.Type);
        _ = statusMsg!.Tenant
            .Should()
            .Be(expectedMsg.Tenant);
        _ = statusMsg!.Path
            .Should()
            .Be(expectedMsg.Path);
        _ = statusMsg!.Subproject
            .Should()
            .Be(expectedMsg.Subproject);

        _ = statusMsg!.Status
            .Should()
            .Be(Status.Started.ToString());
        _ = statusMsg!.StatusDescription
            .Should()
            .Be(Status.Started.Description());
        _ = statusMsg!.DatasetsCnt
            .Should()
            .Be(0);
        _ = statusMsg!.CompletedCnt
            .Should()
            .Be(0);
        _ = statusMsg!.FailedCnt
            .Should()
            .Be(0);
    }

    [Fact]
    public async Task DeleteDeletionOperationAsync()
    {
        // Arrange
        var expectedMsg = await PushDeleteOperationMessage();

        // Act
        await _queue.DeleteDeletionOperationAsync(expectedMsg.OperationId);

        // Assert
        var result = await DbMock.Object.HashGetAllAsync(new RedisKey(QUEUE_NAME + ":" + expectedMsg.OperationId));
        _ = result.Should().BeEmpty();
    }
}
