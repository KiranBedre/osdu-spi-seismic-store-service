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
using Sidecar.Common.Utility;
using Xunit.Abstractions;

public class ChangeTierTaskExecutorTests(ITestOutputHelper output)
{

    private readonly ITestOutputHelper _output = output;

    [Fact]
    public async Task ExecuteAsync_Should_Process_ChangeTier_Operation()
    {
        // Arrange
        var loggerMock = new Mock<ILogger<ChangeTierTaskExecutor>>();
        var taskStatusStorageMock = new Mock<IChangeTierTaskStatusStorage>();
        var itemsRetrieverMock = new Mock<IChangeTierItemsRetriever>();
        var bulkChangeTierWorkerMock = new Mock<IBulkChangeTierWorker>();
        var lockManagerMock = new Mock<ILockManager>();

        var service = new ChangeTierTaskExecutor(
            loggerMock.Object,
            taskStatusStorageMock.Object,
            itemsRetrieverMock.Object,
            bulkChangeTierWorkerMock.Object,
            lockManagerMock.Object
        );

        var cancellationSource = new CancellationTokenSource();

        var changeTierOperation = InitializeStatus();

        var changeTierErrors = false;

        var itemsToChangeTier = new List<ChangeTierItem> {
            new() {
                    Id = "123",
                    Gcsurl = "container/folder",
                    Path = "/some/path",
                    Name = "Example1"
                },
            new() {
                    Id = "456",
                    Gcsurl = "container/folder",
                    Path = "/some/path",
                    Name = "Example2"
                },
        };

        var tier = "";

        var lockedSession = new WriteLockSession
        {
            Locked = true
        };

        _ = taskStatusStorageMock.Setup(tss => tss.CreateChangeTierOperationStatusAsync(changeTierOperation, It.IsAny<CancellationToken>()))
            .ReturnsAsync(changeTierOperation);

        _ = itemsRetrieverMock.Setup(retriever => retriever.GetItemsAsync(changeTierOperation.Tenant, changeTierOperation.Query, changeTierOperation.Parameters, null, cancellationSource.Token))
                          .ReturnsAsync((itemsToChangeTier, null));

        _ = lockManagerMock.Setup(manager => manager.AcquireWriteLockAsync(It.IsAny<string>()))
                       .ReturnsAsync(lockedSession);

        _ = lockManagerMock.Setup(manager => manager.RemoveWriteLockAsync(It.IsAny<WriteLockSession>()))
               .ReturnsAsync(true);

        // Act
        await service.ProcessAsync(changeTierOperation, cancellationSource.Token);

        // Assert
        itemsRetrieverMock.Verify(retriever => retriever.GetItemsAsync(changeTierOperation.Tenant, changeTierOperation.Query, changeTierOperation.Parameters, null, cancellationSource.Token), Times.Once);
        lockManagerMock.Verify(manager => manager.AcquireWriteLockAsync(It.IsAny<string>()), Times.Exactly(itemsToChangeTier.Count));
        bulkChangeTierWorkerMock.Verify(
            worker => worker.RunBulkChangeTierAsync(
                changeTierOperation.Tenant,
                changeTierOperation.OperationId,
                tier,
                It.Is<List<ChangeTierItem>>(list => list.Count == 0),
                It.IsAny<CancellationToken>()),
            Times.Once);
        lockManagerMock.Verify(manager => manager.RemoveWriteLockAsync(It.IsAny<WriteLockSession>()), Times.Exactly(itemsToChangeTier.Count));
        Assert.Equal(2, itemsToChangeTier.Count);
        taskStatusStorageMock.Verify(tss => tss.CreateChangeTierOperationStatusAsync(changeTierOperation, It.IsAny<CancellationToken>()), Times.Once);
        taskStatusStorageMock.Verify(tss => tss.UpdateFieldStatusOperationAsync(changeTierOperation.OperationId, Constants.ChangeTierOperationStatus.DATASETS_CNT, itemsToChangeTier.Count.ToString(), It.IsAny<CancellationToken>()), Times.Once);
        taskStatusStorageMock.Verify(tss => tss.UpdateFieldStatusOperationAsync(changeTierOperation.OperationId, Constants.ChangeTierOperationStatus.STATUS, Status.Completed.ToString(), It.IsAny<CancellationToken>()), Times.Once);
        taskStatusStorageMock.Verify(tss => tss.UpdateFieldStatusOperationAsync(changeTierOperation.OperationId, Constants.ChangeTierOperationStatus.STATUS_DESCRIPTION, Status.Completed.Description(), It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task ExecuteAsync_WithoutAcquiringLock_And_No_Slashes_Should_Process_ChangeTier_For_Free_OnesAsync()
    {
        // Arrange
        var loggerMock = new Mock<ILogger<ChangeTierTaskExecutor>>();
        var taskStatusStorageMock = new Mock<IChangeTierTaskStatusStorage>();
        var itemsRetrieverMock = new Mock<IChangeTierItemsRetriever>();
        var bulkChangeTierWorkerMock = new Mock<IBulkChangeTierWorker>();
        var lockManagerMock = new Mock<ILockManager>();

        var service = new ChangeTierTaskExecutor(
            loggerMock.Object,
            taskStatusStorageMock.Object,
            itemsRetrieverMock.Object,
            bulkChangeTierWorkerMock.Object,
            lockManagerMock.Object
        );

        var cancellationSource = new CancellationTokenSource();

        var changeTierOperation = InitializeStatus();

        var item1 = new ChangeTierItem
        {
            Id = "123",
            Gcsurl = "container/folder",
            Path = "/some/path",
            Name = "Example1"
        };

        var item2 = new ChangeTierItem
        {
            Id = "456",
            Gcsurl = "container/folder",
            Path = "/some/path2",
            Name = "Example2"
        };

        var tier = "";

        var itemsToLockAndChangeTier = new List<ChangeTierItem> { item1, item2 };

        var itemsToChangeTier = new List<ChangeTierItem> { item2 };

        var changeTierErrors = false;

        var lockedSession = new WriteLockSession
        {
            Locked = true
        };

        var notLockedSession = new WriteLockSession
        {
            Locked = false
        };

        _ = taskStatusStorageMock.Setup(tss => tss.CreateChangeTierOperationStatusAsync(changeTierOperation, It.IsAny<CancellationToken>()))
            .ReturnsAsync(changeTierOperation);
        _ = itemsRetrieverMock.Setup(retriever => retriever.GetItemsAsync(changeTierOperation.Tenant, changeTierOperation.Query, changeTierOperation.Parameters, null, cancellationSource.Token))
                          .ReturnsAsync((itemsToLockAndChangeTier, null));
        _ = lockManagerMock.Setup(manager => manager.AcquireWriteLockAsync($"{changeTierOperation.Tenant}/{changeTierOperation.Subproject}/some/path1/Example1"))
               .ReturnsAsync(lockedSession);

        _ = lockManagerMock.Setup(manager => manager.AcquireWriteLockAsync(GetLockKeyPrefix(changeTierOperation) + "/some/path1/Example1"))
                       .ReturnsAsync(lockedSession);

        _ = lockManagerMock.Setup(manager => manager.AcquireWriteLockAsync(GetLockKeyPrefix(changeTierOperation) + "/some/path2/Example2"))
                       .ReturnsAsync(lockedSession);


        // Act
        await service.ProcessAsync(changeTierOperation, cancellationSource.Token);

        // Assert
        taskStatusStorageMock.Verify(tss => tss.CreateChangeTierOperationStatusAsync(changeTierOperation, It.IsAny<CancellationToken>()), Times.Once);
        taskStatusStorageMock.Verify(tss => tss.UpdateFieldStatusOperationAsync(changeTierOperation.OperationId, Constants.ChangeTierOperationStatus.DATASETS_CNT, "2", It.IsAny<CancellationToken>()), Times.Once);
        itemsRetrieverMock.Verify(retriever => retriever.GetItemsAsync(changeTierOperation.Tenant, changeTierOperation.Query, changeTierOperation.Parameters, null, cancellationSource.Token), Times.Once);
        lockManagerMock.Verify(manager => manager.AcquireWriteLockAsync(It.IsAny<string>()), Times.Exactly(1));
        bulkChangeTierWorkerMock.Verify(worker => worker.RunBulkChangeTierAsync(changeTierOperation.Tenant, changeTierOperation.OperationId, tier, itemsToChangeTier, cancellationSource.Token), Times.Never);
        taskStatusStorageMock.Verify(tss => tss.UpdateFieldStatusOperationAsync(changeTierOperation.OperationId, Constants.ChangeTierOperationStatus.STATUS, Status.CompletedWithErrors.ToString(), It.IsAny<CancellationToken>()), Times.Once);
        taskStatusStorageMock.Verify(tss => tss.UpdateFieldStatusOperationAsync(changeTierOperation.OperationId, Constants.ChangeTierOperationStatus.STATUS_DESCRIPTION, Status.CompletedWithErrors.Description(), It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task ExecuteAsync_ItemLocked_ShouldIncreaseFailedCntAsync()
    {
        // Arrange
        var loggerMock = new Mock<ILogger<ChangeTierTaskExecutor>>();
        var taskStatusStorageMock = new Mock<IChangeTierTaskStatusStorage>();
        var itemsRetrieverMock = new Mock<IChangeTierItemsRetriever>();
        var bulkChangeTierWorkerMock = new Mock<IBulkChangeTierWorker>();
        var lockManagerMock = new Mock<ILockManager>();

        var service = new ChangeTierTaskExecutor(
            loggerMock.Object,
            taskStatusStorageMock.Object,
            itemsRetrieverMock.Object,
            bulkChangeTierWorkerMock.Object,
            lockManagerMock.Object
        );

        var changeTierOperation = InitializeStatus();
        var cancellationSource = new CancellationTokenSource();

        var itemsToChangeTier = new List<ChangeTierItem> {
            new() {
                    Id = "123",
                    Gcsurl = "container/folder",
                    Path = "/some/path1/",
                    Name = "Example1"
                },
             new() {
                    Id = "456",
                    Gcsurl = "container/folder",
                    Path = "/some/path2",
                    Name = "Example2"
                }
        };

        var lockedSession = new WriteLockSession
        {
            Locked = true
        };

        var notLockedSession = new WriteLockSession
        {
            Locked = false
        };

        _ = taskStatusStorageMock.Setup(tss => tss.CreateChangeTierOperationStatusAsync(changeTierOperation, It.IsAny<CancellationToken>()))
            .ReturnsAsync(changeTierOperation);

        _ = itemsRetrieverMock.Setup(retriever => retriever.GetItemsAsync(changeTierOperation.Tenant, changeTierOperation.Query, changeTierOperation.Parameters, null, cancellationSource.Token))
                          .ReturnsAsync((itemsToChangeTier, null));

        _ = lockManagerMock.Setup(manager => manager.AcquireWriteLockAsync(GetLockKeyPrefix(changeTierOperation) + "/some/path1/Example1"))
                       .ReturnsAsync(lockedSession);

        _ = lockManagerMock.Setup(manager => manager.AcquireWriteLockAsync(GetLockKeyPrefix(changeTierOperation) + "/some/path2/Example2"))
                       .ReturnsAsync(notLockedSession);

        // Act
        await service.ProcessAsync(changeTierOperation, cancellationSource.Token);

        // Assert
        taskStatusStorageMock.Verify(tss => tss.CreateChangeTierOperationStatusAsync(changeTierOperation, It.IsAny<CancellationToken>()), Times.Once);
        taskStatusStorageMock.Verify(tss => tss.IncrementCountAsync(changeTierOperation.OperationId, Constants.ChangeTierOperationStatus.FAILED_CNT, It.IsAny<CancellationToken>()), Times.Once());
        taskStatusStorageMock.Verify(tss => tss.UpdateFieldStatusOperationAsync(changeTierOperation.OperationId, Constants.ChangeTierOperationStatus.STATUS, Status.CompletedWithErrors.ToString(), It.IsAny<CancellationToken>()), Times.Once);
        taskStatusStorageMock.Verify(tss => tss.UpdateFieldStatusOperationAsync(changeTierOperation.OperationId, Constants.ChangeTierOperationStatus.STATUS_DESCRIPTION, Status.CompletedWithErrors.Description(), It.IsAny<CancellationToken>()), Times.Once);
    }

    private static ChangeTierOperationStatus InitializeStatus() => new()
    {
        OperationId = "operation123",
        Tenant = "tenant",
        Subproject = "subproject",
        Query = "SELECT c.id FROM c",
        Parameters = "[{\"name\":\"@parameter\",\"value\":\"subproject123\"}]\"]",
        CreatedAt = DateTime.UtcNow,
        LastUpdatedAt = DateTime.UtcNow,
        CreatedBy = "Sidecar.QueueHandlerRedis",
        Status = Status.Started.ToString(),
        StatusDescription = Status.Started.Description(),
        DatasetsCnt = 0,
        CompletedCnt = 0,
        FailedCnt = 0,
    };

    private static string GetLockKeyPrefix(IChangeTierOperationMessage changeTierOperation) => changeTierOperation.Tenant + "/" + changeTierOperation.Subproject;
}
