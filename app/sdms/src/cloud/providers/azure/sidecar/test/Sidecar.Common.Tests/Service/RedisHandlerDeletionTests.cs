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

public class RedisHandlerDeletionTests : RedisHandlerTests
{
    public const string QueueName = "somequeue";
    private readonly RedisHandlerDeletion QueueHandler;
    public RedisHandlerDeletionTests() : base()
    {
        RedisConnectionFactory.Setup(m => m.GetRedisForQueue()).Returns(ConnectionMultiplexer.Object);
        QueueHandler = GetQueueHandler();
    }

    private RedisHandlerDeletion GetQueueHandler() => new RedisHandlerDeletion(
            TestingHelpers.GetLogger<RedisHandlerDeletion>().Object
            , new Options
            {
                QueueName = QueueName,
            }
            , RedisConnectionFactory.Object);

    protected async Task<DeleteOperationMessage> PushDeleteOperationMessage()
    {
        var expectedMsg = TestingHelpers.GetDelOpMsg();
        //-- The queue is a List, make sure it exists and push the operation id
        _ = await QueueHandler.ListLeftPushAsync(QueueName, expectedMsg.OperationId);

        //---add the id to the queue of del operations
        var he = TestingHelpers.GetDelOpMsgHashEntry(expectedMsg, true);

        //---add the del operations payload to the queue
        var key = QueueName + ":" + expectedMsg.OperationId;
        QueueHandler.Set(new RedisKey(key), he);

        return expectedMsg;
    }

    [Fact]
    public async Task CheckForDeletionOperationAsync_QueueDoesNotExist_RedisException()
    {
        // Arrange

        // Act and Assert
        await Assert.ThrowsAsync<RedisException>(() => QueueHandler.CheckForDeletionOperationAsync());
    }


    [Fact]
    public async Task CheckForDeletionOperationAsync_QueueIsEmpty_ReturnsNull()
    {
        // Arrange
        var expectedMsg = await PushDeleteOperationMessage();


        // Act
        var statusMsg = await QueueHandler.CheckForDeletionOperationAsync();
        statusMsg = await QueueHandler.CheckForDeletionOperationAsync();

        // Assert
        Assert.Null(statusMsg);
    }

    [Fact]
    private async Task CheckForDeletionOperationAsync_Success()
    {
        // Arrange
        var expectedMsg = await PushDeleteOperationMessage();

        // Act
        var statusMsg = await QueueHandler.CheckForDeletionOperationAsync();

        // Assert
        statusMsg.Should()
            .NotBeNull();

        statusMsg!.OperationId
            .Should()
            .Be(expectedMsg.OperationId);
        statusMsg!.Tenant
            .Should()
            .Be(expectedMsg.Tenant);
        statusMsg!.Path
            .Should()
            .Be(expectedMsg.Path);
        statusMsg!.Subproject
            .Should()
            .Be(expectedMsg.Subproject);

        statusMsg!.Status
            .Should()
            .Be(Status.Started.ToString());
        statusMsg!.StatusDescription
            .Should()
            .Be(Status.Started.Description());
        statusMsg!.DatasetsCnt
            .Should()
            .Be(0);
        statusMsg!.DeletedCnt
            .Should()
            .Be(0);
        statusMsg!.FailedCnt
            .Should()
            .Be(0);
    }
}
