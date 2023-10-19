namespace Sidecar.Common.Tests.TaskQueue;

using Newtonsoft.Json;
using Sidecar.Common.Config;
using Sidecar.Common.TaskQueue;

public class TaskQueueBackgroundServiceTests
{
    private readonly Mock<ILogger<TaskQueueBackgroundService<ITaskQueueWorker>>> _loggerMock = new();
    private readonly Mock<ITaskQueueWorker> _workerMock = new(MockBehavior.Strict);
    private readonly TaskQueueBackgroundService<ITaskQueueWorker> _service;

    public TaskQueueBackgroundServiceTests()
    {
        _service = new(_loggerMock.Object, _workerMock.Object, new() {WaitTimeIfTaskNotFound = TimeSpan.Zero});
    }

    [Fact]
    public async Task ShouldSwallowExceptionsAndStopOnlyIfCancelled()
    {
        // ARRANGE
        var cts = new CancellationTokenSource();
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
        _ = await Assert.ThrowsAsync<OperationCanceledException>(
            () => _service.StartAsync(cts.Token));

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
}
