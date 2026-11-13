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

using Newtonsoft.Json;
using Sidecar.Common.TaskQueue;

public class TaskQueueBackgroundServiceTests
{
    private readonly Mock<ILogger<TaskQueueBackgroundService<ITaskQueueWorker>>> _loggerMock = new();
    private readonly Mock<ITaskQueueWorker> _workerMock = new(MockBehavior.Strict);
    private readonly TaskQueueBackgroundService<ITaskQueueWorker> _service;

    public TaskQueueBackgroundServiceTests()
    {
        _service = new(_loggerMock.Object, _workerMock.Object, new() { DelayWhenTaskNotFound = TimeSpan.Zero });
    }

    [Fact]
    public async Task ShouldSwallowExceptionsAndStopOnlyIfCancelled()
    {
        // ARRANGE
        using var service = _service;
        using var cts = new CancellationTokenSource();
        _ = _workerMock.SetupSequence(m => m.HandleNextTaskAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(() => ExecutionStatus.TaskNotFound)
            .Throws<ArithmeticException>(() => new("this exception should be logged and swallowed"))
            .Throws<JsonException>(() => new("this exception should be logged and swallowed"))
            .ReturnsAsync(() => ExecutionStatus.TaskCompleted)
            .ReturnsAsync(() =>
            {
                cts.Cancel();
                return ExecutionStatus.TaskCompleted;
            });

        // ACT
        await _service.StartAsync(cts.Token);
        _ = await Assert.ThrowsAnyAsync<OperationCanceledException>(
            () => _service.ExecuteTask!.WaitAsync(TimeSpan.FromSeconds(10)));

        // ASSERT
        _workerMock.Verify(m => m.HandleNextTaskAsync(It.IsAny<CancellationToken>()), Times.Exactly(5));
        _loggerMock.Verify(m => m.Log(
            It.Is<LogLevel>(logLevel => logLevel == LogLevel.Error),
            It.IsAny<EventId>(),
            It.IsAny<It.IsAnyType>(),
            It.IsAny<Exception>(),
            It.IsAny<Func<It.IsAnyType, Exception?, string>>()
        ), Times.Exactly(2));
    }

    [Fact]
    public async Task ShouldCancelAnActiveWorkerWhenStopped()
    {
        var started = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        _ = _workerMock.Setup(m => m.HandleNextTaskAsync(It.IsAny<CancellationToken>()))
            .Returns(async (CancellationToken token) =>
            {
                started.SetResult();
                await Task.Delay(Timeout.InfiniteTimeSpan, token);
                return ExecutionStatus.TaskCompleted;
            });

        using (_service)
        using (var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(10)))
        {
            await _service.StartAsync(timeout.Token);
            await started.Task.WaitAsync(timeout.Token);
            await _service.StopAsync(timeout.Token);

            Assert.True(_service.ExecuteTask!.IsCanceled);
            _workerMock.Verify(m => m.HandleNextTaskAsync(It.IsAny<CancellationToken>()), Times.Once);
        }
    }

    [Fact]
    public async Task ShouldCancelIdleDelayWhenStopped()
    {
        var started = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        _ = _workerMock.Setup(m => m.HandleNextTaskAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(() =>
            {
                started.SetResult();
                return ExecutionStatus.TaskNotFound;
            });
        using var service = new TaskQueueBackgroundService<ITaskQueueWorker>(
            _loggerMock.Object, _workerMock.Object, new() { DelayWhenTaskNotFound = TimeSpan.FromMinutes(1) });
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(10));

        await service.StartAsync(timeout.Token);
        await started.Task.WaitAsync(timeout.Token);
        await service.StopAsync(timeout.Token);

        Assert.True(service.ExecuteTask!.IsCanceled);
        _workerMock.Verify(m => m.HandleNextTaskAsync(It.IsAny<CancellationToken>()), Times.Once);
    }
}
