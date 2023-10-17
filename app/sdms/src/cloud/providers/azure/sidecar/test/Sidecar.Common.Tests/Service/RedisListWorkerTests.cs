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

using FluentAssertions.ArgumentMatchers.Moq;
using Sidecar.Common.TaskQueue;

// type alias for readability
using WorkerType = Sidecar.Common.TaskQueue.RedisListWorker<
    IDeletionOperationMessage,
    TaskQueue.DeletionTaskHashEntriesDeserializer,
    ITaskExecutor<IDeletionOperationMessage>
>;

public class RedisListWorkerTests
{
    private const string QUEUE_NAME = "somequeue";
    private readonly WorkerType _worker;
    private readonly Mock<ILogger<WorkerType>> _loggerMock = new();
    private readonly DeletionTaskHashEntriesDeserializer _deserializer = new();
    private readonly Mock<ITaskExecutor<IDeletionOperationMessage>> _executorMock = new();
    private readonly Mock<IDatabase> _spyDb;

    public RedisListWorkerTests()
    {
        _spyDb = TestingHelpers.GetDatabase();
        var mockConnectionMultiplexer = TestingHelpers.GetConnectionMultiplexer(_spyDb.Object);
        var redisConnectionFactory = new Mock<IRedisConnectionFactory>();

        _ = redisConnectionFactory
            .Setup(m => m.GetRedisForQueue())
            .Returns(
                new RedisHandler(
                    TestingHelpers.GetLogger<RedisHandler>().Object,
                    mockConnectionMultiplexer.Object
                ));

        var opts = new Options { QueueName = QUEUE_NAME };
            
        _worker = new(_loggerMock.Object, _deserializer, _executorMock.Object, redisConnectionFactory.Object, opts);
    }

    private async Task<DeleteOperationMessage> PushDeleteOperationMessage()
    {
        var expectedMsg = TestingHelpers.GetDelOpMsg();
        //-- The queue is a List, make sure it exists and push the operation id

        _ = await _spyDb.Object.ListLeftPushAsync(QUEUE_NAME, expectedMsg.OperationId);

        //---add the id to the queue of del operations
        var hashEntries = TestingHelpers.GetDelOpMsgHashEntry(expectedMsg, true);

        //---add the del operations payload to the queue
        var key = QUEUE_NAME + ":" + expectedMsg.OperationId;
        _spyDb.Object.HashSet(new(key), hashEntries);

        return expectedMsg;
    }
    
    [Fact]
    public async Task CheckForDeletionOperationAsync_QueueIsEmpty_DoesNotCallExecutor()
    {
        // Arrange
        // do nothing

        // Act
        await _worker.HandleNextTask(CancellationToken.None);

        // Assert
        _executorMock.Verify(e => e.Process(It.IsAny<IDeletionOperationMessage>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(1)]
    [InlineData(10)]
    private async Task ExecutorFinishingSuccessfully_DeletesMessageFromQueue(int extraMessageCount)
    {
        // Arrange
        for (int i = 0; i < extraMessageCount; ++i)
        {
            await PushDeleteOperationMessage();
        }
        var expectedMsg = await PushDeleteOperationMessage();

        // Act
        await _worker.HandleNextTask(CancellationToken.None);

        // Assert
        _executorMock.Verify(e => e.Process(Its.EquivalentTo(expectedMsg), It.IsAny<CancellationToken>()), Times.Once);

        var queueItems = _spyDb.Object.ListRange(QUEUE_NAME);
        queueItems.Length.Should().Be(extraMessageCount);
    }
    
    [Theory]
    [InlineData(0)]
    [InlineData(1)]
    [InlineData(10)]
    private async Task ExecutorRaisingError_ReturnsMessageToTheQueue(int extraMessageCount)
    {
        // Arrange
        for (int i = 0; i < extraMessageCount; ++i)
        {
            await PushDeleteOperationMessage();
        }
        var expectedMsg = await PushDeleteOperationMessage();

        _executorMock.Setup(e => e.Process(It.IsAny<IDeletionOperationMessage>(), It.IsAny<CancellationToken>())).Throws<TestException>();

        // Act
        var action = async () => await _worker.HandleNextTask(CancellationToken.None);
        await action.Should().ThrowAsync<TestException>();

        // Assert
        _executorMock.Verify(e => e.Process(Its.EquivalentTo(expectedMsg), It.IsAny<CancellationToken>()), Times.Once);

        var queueItems = _spyDb.Object.ListRange(QUEUE_NAME);
        queueItems.Length.Should().Be(extraMessageCount + 1);
    }
    
    private class TestException : Exception {}
}
