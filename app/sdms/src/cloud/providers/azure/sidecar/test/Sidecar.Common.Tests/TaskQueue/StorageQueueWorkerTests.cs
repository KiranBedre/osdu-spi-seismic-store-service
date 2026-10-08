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

using Azure;
using Azure.Storage.Queues;
using Azure.Storage.Queues.Models;
using FluentAssertions.ArgumentMatchers.Moq;
using Sidecar.Common.TaskQueue;
using System.Text.Json;

// type alias for readability
using WorkerType = Sidecar.Common.TaskQueue.StorageQueueWorker<
    IDeletionOperationMessage,
    ITaskDeserializer<string, IDeletionOperationMessage>,
    ITaskExecutor<IDeletionOperationMessage>
>;

public class StorageQueueWorkerTests
{
    private readonly Mock<ILogger<WorkerType>> _loggerMock = new(MockBehavior.Loose);
    private readonly DeletionTaskJsonDeserializer _deserializer = new();
    private readonly Mock<ITaskExecutor<IDeletionOperationMessage>> _executorMock = new(MockBehavior.Strict);
    private readonly Mock<QueueClient> _queueClientMock = new(MockBehavior.Strict);
    private readonly Mock<QueueClient> _poisonQueueClientMock = new(MockBehavior.Strict);

    private WorkerType BuildWorker(int maxDequeueCount, TimeSpan lockDuration, TimeSpan lockRenewalPeriod) => new(
            _loggerMock.Object,
            _queueClientMock.Object,
            _deserializer,
            _executorMock.Object,
            new()
            {
                MaxDequeueCount = maxDequeueCount,
                LockDuration = lockDuration,
                LockRenewalPeriod = lockRenewalPeriod,
                PoisonQueueClient = _poisonQueueClientMock.Object,
            });

    [Theory]
    [InlineData(0, 0)]
    [InlineData(1, 0)]
    [InlineData(10, 0)]
    [InlineData(0, 4)]
    [InlineData(1, 4)]
    [InlineData(10, 4)]
    private async Task WhenNoGoodTasksInQueue_ShouldDeleteThemAndSucceed(int tasksWithToManyRetries, int retryLimit)
    {
        // ARRANGE
        var messagePayload = JsonSerializer.Serialize(TestingHelpers.GetDelOpMsg());

        var sequence = _queueClientMock.SetupSequence(qc => qc.ReceiveMessageAsync(
            It.IsAny<TimeSpan>(),
            It.IsAny<CancellationToken>())
        );
        for (var i = 0; i < tasksWithToManyRetries; ++i)
        {
            var tooManyRetries = retryLimit + 1;
            _ = sequence.ReturnsAsync(FakeResponse(FakeMessage(messagePayload, tooManyRetries)));
        }
        _ = sequence.ReturnsAsync(FakeResponse<QueueMessage>(null!));

        _queueClientMock.Setup(qc => qc.DeleteMessageAsync(
            It.IsAny<string>(), // messageId
            It.IsAny<string>(), // popReceipt
            It.IsAny<CancellationToken>())
        ).ReturnsAsync(new Mock<Response>().Object).Verifiable();
        _poisonQueueClientMock.Setup(qc => qc.SendMessageAsync(
            messagePayload,
            It.IsAny<CancellationToken>())
        ).ReturnsAsync((Response<SendReceipt>)null!).Verifiable();

        var worker = BuildWorker(
            maxDequeueCount: retryLimit,
            lockDuration: TimeSpan.FromMinutes(5),
            lockRenewalPeriod: TimeSpan.FromMinutes(3));

        // ACT
        _ = await worker.HandleNextTaskAsync(CancellationToken.None);

        // ASSERT
        _queueClientMock.Verify(qc => qc.ReceiveMessageAsync(
            It.IsAny<TimeSpan>(),
            It.IsAny<CancellationToken>()), Times.Exactly(tasksWithToManyRetries + 1));

        _queueClientMock.Verify(qc => qc.DeleteMessageAsync(
            It.IsAny<string>(),
            It.IsAny<string>(),
            It.IsAny<CancellationToken>()), Times.Exactly(tasksWithToManyRetries));

        _poisonQueueClientMock.Verify(qc => qc.SendMessageAsync(
            messagePayload,
            It.IsAny<CancellationToken>()), Times.Exactly(tasksWithToManyRetries));

        _queueClientMock.VerifyNoOtherCalls();
    }

    [Fact]
    private async Task WhenSuccess_ShouldDeleteMessageFromQueue()
    {
        // ARRANGE
        var expectedMsg = TestingHelpers.GetDelOpMsg();
        var messagePayload = JsonSerializer.Serialize(expectedMsg);

        var queueMessage = FakeMessage(messagePayload, 4);

        _queueClientMock.Setup(qc => qc.ReceiveMessageAsync(
            It.IsAny<TimeSpan>(),
            It.IsAny<CancellationToken>())
        ).ReturnsAsync(FakeResponse(queueMessage)).Verifiable();

        _queueClientMock.Setup(qc => qc.DeleteMessageAsync(
            It.IsAny<string>(), // messageId
            It.IsAny<string>(), // popReceipt
            It.IsAny<CancellationToken>())
        ).ReturnsAsync(new Mock<Response>().Object).Verifiable();

        _ = _executorMock
            .Setup(e => e.ProcessAsync(Its.EquivalentTo(expectedMsg), It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask);

        var worker = BuildWorker(
            maxDequeueCount: 5,
            lockDuration: TimeSpan.FromMinutes(5),
            lockRenewalPeriod: TimeSpan.FromMinutes(3));

        // ACT
        _ = await worker.HandleNextTaskAsync(CancellationToken.None);

        // ASSERT
        _queueClientMock.Verify(qc => qc.ReceiveMessageAsync(
            It.IsAny<TimeSpan>(),
            It.IsAny<CancellationToken>()), Times.Once);

        _queueClientMock.Verify(qc => qc.DeleteMessageAsync(
            queueMessage.MessageId,
            queueMessage.PopReceipt,
            It.IsAny<CancellationToken>()), Times.Once);

        _queueClientMock.VerifyNoOtherCalls();
    }

    /// <summary>
    /// This test verifies 2 invariants:
    /// Every message update issues a new "pop receipt" that must be passed to the subsequent message updates.
    /// Every 
    /// </summary>
    [Fact]
    private async Task WhenRunsLong_ShouldUpdateMessageLockWithCorrectPopReceipt()
    {
        // ARRANGE
        var expectedMsg = TestingHelpers.GetDelOpMsg();
        var messagePayload = JsonSerializer.Serialize(expectedMsg);

        var queueMessage = FakeMessage(messagePayload, 4);

        // note: this test expects the task duration to be long enough
        // to trigger multiple lock renewals.
        var expectedLockDuration = TimeSpan.FromSeconds(1);
        var expectedLockRenewalPeriod = TimeSpan.FromMilliseconds(100);
        var taskExecutionDuration = TimeSpan.FromSeconds(2);

        _queueClientMock.Setup(qc => qc.ReceiveMessageAsync(
            It.IsAny<TimeSpan>(),
            It.IsAny<CancellationToken>())
        ).ReturnsAsync(FakeResponse(queueMessage)).Verifiable();

        _queueClientMock.Setup(qc => qc.DeleteMessageAsync(
            queueMessage.MessageId, // messageId
            It.IsAny<string>(), // popReceipt
            It.IsAny<CancellationToken>())
        ).ReturnsAsync(new Mock<Response>().Object).Verifiable();

        var createdPopReceipts = new List<string>();
        var receivedPopReceipts = new List<string>();
        _ = _queueClientMock.Setup(qc => qc.UpdateMessageAsync(
            queueMessage.MessageId, // messageId
            Capture.In(receivedPopReceipts), // popReceipt
            default(string),
            expectedLockDuration,
            It.IsAny<CancellationToken>())
        ).ReturnsAsync(() =>
        {
            var receipt = FakeUpdateReceipt();
            createdPopReceipts.Add(receipt.PopReceipt);
            return FakeResponse(receipt);
        });

        _ = _executorMock
            .Setup(e => e.ProcessAsync(Its.EquivalentTo(expectedMsg), It.IsAny<CancellationToken>()))
            .Returns(() => Task.Run(() => Task.Delay(taskExecutionDuration)));

        var worker = BuildWorker(
            maxDequeueCount: 5,
            lockDuration: expectedLockDuration,
            lockRenewalPeriod: expectedLockRenewalPeriod);

        // ACT
        _ = await worker.HandleNextTaskAsync(CancellationToken.None);

        // ASSERT
        _queueClientMock.Verify(qc => qc.ReceiveMessageAsync(
            expectedLockDuration,
            It.IsAny<CancellationToken>()), Times.Once);

        _queueClientMock.Verify(qc => qc.DeleteMessageAsync(
            queueMessage.MessageId,
            createdPopReceipts.Last(),
            It.IsAny<CancellationToken>()), Times.Once);

        _queueClientMock.Verify(qc => qc.UpdateMessageAsync(
            queueMessage.MessageId, // messageId
            It.IsAny<string>(), // popReceipt
            default(string),
            expectedLockDuration,
            It.IsAny<CancellationToken>()), Times.AtLeastOnce);

        _ = receivedPopReceipts[0].Should().Be(queueMessage.PopReceipt);
        for (var i = 1; i < receivedPopReceipts.Count; ++i)
        {
            _ = receivedPopReceipts[i].Should().Be(createdPopReceipts[i - 1]);
        }

        // sanity check - should generate a new pop receipt every time for this test to make sense
        _ = createdPopReceipts.Distinct().Count().Should().Be(createdPopReceipts.Count);

        _queueClientMock.VerifyNoOtherCalls();
    }

    [Fact]
    private async Task WhenFailure_ShouldReturnMessageToQueue()
    {
        // ARRANGE
        var expectedMsg = TestingHelpers.GetDelOpMsg();
        var messagePayload = JsonSerializer.Serialize(expectedMsg);

        var queueMessage = FakeMessage(messagePayload, 4);

        _queueClientMock.Setup(qc => qc.ReceiveMessageAsync(
            It.IsAny<TimeSpan>(),
            It.IsAny<CancellationToken>())
        ).ReturnsAsync(FakeResponse(queueMessage)).Verifiable();

        _queueClientMock.Setup(qc => qc.UpdateMessageAsync(
            It.IsAny<string>(), // messageId
            It.IsAny<string>(), // popReceipt
            It.IsAny<string>(), // messageText
            TimeSpan.Zero, // visibilityTimeout
            It.IsAny<CancellationToken>())
        ).ReturnsAsync(new Mock<Response<UpdateReceipt>>().Object).Verifiable();

        var failedTask = Task.Run(() => throw new("Error 42"));
        _ = _executorMock
            .Setup(e => e.ProcessAsync(Its.EquivalentTo(expectedMsg), It.IsAny<CancellationToken>()))
            .Returns(failedTask);

        var worker = BuildWorker(
            maxDequeueCount: 5,
            lockDuration: TimeSpan.FromMinutes(5),
            lockRenewalPeriod: TimeSpan.FromMinutes(3));

        // ACT
        _ = await Assert.ThrowsAsync<Exception>(() => worker.HandleNextTaskAsync(CancellationToken.None));

        // ASSERT
        _queueClientMock.Verify(qc => qc.ReceiveMessageAsync(
            It.IsAny<TimeSpan>(),
            It.IsAny<CancellationToken>()), Times.Once);

        _queueClientMock.Verify(qc => qc.UpdateMessageAsync(
            queueMessage.MessageId,
            queueMessage.PopReceipt,
            default(string),
            TimeSpan.Zero, // visibilityTimeout
            It.IsAny<CancellationToken>()), Times.Once);

        _queueClientMock.VerifyNoOtherCalls();
    }

    [Fact]
    private async Task WhenLostLock_ShouldCancelExecution()
    {
        // ARRANGE
        var expectedMsg = TestingHelpers.GetDelOpMsg();
        var messagePayload = JsonSerializer.Serialize(expectedMsg);

        var queueMessage = FakeMessage(messagePayload, 4);

        _queueClientMock.Setup(qc => qc.ReceiveMessageAsync(
            It.IsAny<TimeSpan>(),
            It.IsAny<CancellationToken>())
        ).ReturnsAsync(FakeResponse(queueMessage)).Verifiable();

        // Trying to prolong the lock will always fail
        _queueClientMock.Setup(qc => qc.UpdateMessageAsync(
            It.IsAny<string>(), // messageId
            It.IsAny<string>(), // popReceipt
            It.IsAny<string>(), // messageText
            It.IsAny<TimeSpan>(), // visibilityTimeout
            It.IsAny<CancellationToken>())
        ).ThrowsAsync(new("oops")).Verifiable();

        // Executor just waits a while unless cancelled.
        Task? actualExecutorTask = null;
        _ = _executorMock
            .Setup(e => e.ProcessAsync(Its.EquivalentTo(expectedMsg), It.IsAny<CancellationToken>()))
            .Returns((IDeletionOperationMessage _, CancellationToken ct) => actualExecutorTask = Task.Delay(TimeSpan.FromSeconds(10), ct));

        var worker = BuildWorker(
            maxDequeueCount: 5,
            lockDuration: TimeSpan.FromMinutes(5),
            lockRenewalPeriod: TimeSpan.FromMilliseconds(100)); // should try to renew the lock soon after starting 

        // ACT
        _ = await Assert.ThrowsAsync<Exception>(() => worker.HandleNextTaskAsync(CancellationToken.None));
        _ = actualExecutorTask.Should().NotBeNull();
        _ = actualExecutorTask!.IsCanceled.Should().BeTrue();

        // ASSERT
        _queueClientMock.Verify(qc => qc.ReceiveMessageAsync(
            It.IsAny<TimeSpan>(),
            It.IsAny<CancellationToken>()), Times.Once);

        _queueClientMock.Verify(qc => qc.UpdateMessageAsync(
            queueMessage.MessageId,
            queueMessage.PopReceipt,
            default(string),
            It.Is<TimeSpan>(x => !x.Equals(TimeSpan.Zero)), // visibilityTimeout
            It.IsAny<CancellationToken>()), Times.Once);

        _queueClientMock.VerifyNoOtherCalls();
    }

    private QueueMessage FakeMessage(string payload, int dequeueCount) => FakeMessage(
            messageId: Guid.NewGuid().ToString(),
            popReceipt: Guid.NewGuid().ToString(),
            payload,
            dequeueCount);

    private UpdateReceipt FakeUpdateReceipt() => QueuesModelFactory.UpdateReceipt(
            popReceipt: Guid.NewGuid().ToString(),
            nextVisibleOn: DateTimeOffset.MaxValue);

    private QueueMessage FakeMessage(string messageId, string popReceipt, string payload, int dequeueCount) => QueuesModelFactory.QueueMessage(
            messageId: messageId,
            popReceipt: popReceipt,
            body: new(payload),
            dequeueCount: dequeueCount,
            insertedOn: DateTimeOffset.UtcNow
        );

    private Response<T> FakeResponse<T>(T value)
    {
        var responseMock = new Mock<Response<T>>();
        _ = responseMock.Setup(r => r.Value).Returns(value);
        _ = responseMock.Setup(r => r.HasValue).Returns(true);
        return responseMock.Object;
    }
}
