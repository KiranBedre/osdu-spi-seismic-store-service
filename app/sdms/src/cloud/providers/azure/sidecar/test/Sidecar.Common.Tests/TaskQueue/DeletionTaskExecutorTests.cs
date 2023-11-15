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

public class DeletionTaskExecutorTests
{
    [Fact]
    public async Task ExecuteAsync_Should_Process_Deletion_Operation()
    {
        // Arrange
        var loggerMock = new Mock<ILogger<DeletionTaskExecutor>>();
        var taskStatusStorageMock = new Mock<IDeletionTaskStatusStorage>();
        var itemsRetrieverMock = new Mock<IItemsRetriever>();
        var bulkDeletionWorkerMock = new Mock<IBulkDeletionWorker>();
        var lockManagerMock = new Mock<ILockManager>();

        var service = new DeletionTaskExecutor(
            loggerMock.Object,
            taskStatusStorageMock.Object,
            itemsRetrieverMock.Object,
            bulkDeletionWorkerMock.Object,
            lockManagerMock.Object
        );

        var cancellationSource = new CancellationTokenSource();

        var deletionOperation = InitializeStatus();

        var itemsToDelete = new List<DeleteItem> {
            new DeleteItem
                {
                    Id = "123",
                    Gcsurl = "container/folder",
                    Path = "/some/path",
                    Name = "Example1"
                },
             new DeleteItem
                {
                    Id = "456",
                    Gcsurl = "container/folder",
                    Path = "/some/path",
                    Name = "Example2"
                },
        };

        _ = taskStatusStorageMock.Setup(tss => tss.CreateDeletionOperationStatusAsync(deletionOperation, It.IsAny<CancellationToken>()))
            .ReturnsAsync(deletionOperation); // using the fact that in these tests deletionOperation is already DeleteOperationStatus

        _ = itemsRetrieverMock.Setup(retriever => retriever.GetItemsAsync(deletionOperation.Tenant, deletionOperation.Subproject, deletionOperation.Query, cancellationSource.Token))
                          .ReturnsAsync(itemsToDelete);

        _ = lockManagerMock.Setup(manager => manager.AcquireDeleteLockAsync(It.IsAny<string>()))
                       .ReturnsAsync(true);

        _ = lockManagerMock.Setup(manager => manager.RemoveDeleteLockAsync(It.IsAny<string>()))
               .ReturnsAsync(true);

        // Act
        await service.ProcessAsync(deletionOperation, cancellationSource.Token);

        // Assert
        itemsRetrieverMock.Verify(retriever => retriever.GetItemsAsync(deletionOperation.Tenant, deletionOperation.Subproject, deletionOperation.Query, cancellationSource.Token), Times.Once);
        lockManagerMock.Verify(manager => manager.AcquireDeleteLockAsync(It.IsAny<string>()), Times.Exactly(itemsToDelete.Count));
        bulkDeletionWorkerMock.Verify(worker => worker.RunBulkDeletionAsync(deletionOperation.Tenant, deletionOperation.OperationId, itemsToDelete, cancellationSource.Token), Times.Once);
        lockManagerMock.Verify(manager => manager.RemoveDeleteLockAsync(It.IsAny<string>()), Times.Exactly(itemsToDelete.Count));
        Assert.Equal(2, itemsToDelete.Count);
        taskStatusStorageMock.Verify(tss => tss.CreateDeletionOperationStatusAsync(deletionOperation, It.IsAny<CancellationToken>()), Times.Once);
        taskStatusStorageMock.Verify(tss => tss.UpdateFieldStatusOperationAsync(deletionOperation.OperationId, Constants.DeleteOperationStatus.DATASETS_CNT, itemsToDelete.Count.ToString(), It.IsAny<CancellationToken>()), Times.Once);
        taskStatusStorageMock.Verify(tss => tss.UpdateFieldStatusOperationAsync(deletionOperation.OperationId, Constants.DeleteOperationStatus.STATUS, Status.Completed.ToString(), It.IsAny<CancellationToken>()), Times.Once);
        taskStatusStorageMock.Verify(tss => tss.UpdateFieldStatusOperationAsync(deletionOperation.OperationId, Constants.DeleteOperationStatus.STATUS_DESCRIPTION, Status.Completed.Description(), It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task ExecuteAsync_WithoutAcquiringLock_And_No_Slashes_Should_Process_Deletion_For_Free_OnesAsync()
    {
        // Arrange
        var loggerMock = new Mock<ILogger<DeletionTaskExecutor>>();
        var taskStatusStorageMock = new Mock<IDeletionTaskStatusStorage>();
        var itemsRetrieverMock = new Mock<IItemsRetriever>();
        var bulkDeletionWorkerMock = new Mock<IBulkDeletionWorker>();
        var lockManagerMock = new Mock<ILockManager>();

        var service = new DeletionTaskExecutor(
            loggerMock.Object,
            taskStatusStorageMock.Object,
            itemsRetrieverMock.Object,
            bulkDeletionWorkerMock.Object,
            lockManagerMock.Object
        );

        var cancellationSource = new CancellationTokenSource();

        var deletionOperation = InitializeStatus();

        var item1 = new DeleteItem
        {
            Id = "123",
            Gcsurl = "container/folder",
            Path = "/some/path",
            Name = "Example1"
        };

        var item2 = new DeleteItem
        {
            Id = "456",
            Gcsurl = "container/folder",
            Path = "/some/path2",
            Name = "Example2"
        };

        var itemsToLockAndDelete = new List<DeleteItem> { item1, item2 };

        var itemsToDelete = new List<DeleteItem> { item2 };

        _ = taskStatusStorageMock.Setup(tss => tss.CreateDeletionOperationStatusAsync(deletionOperation, It.IsAny<CancellationToken>()))
            .ReturnsAsync(deletionOperation); // using the fact that in these tests deletionOperation is already DeleteOperationStatus
        _ = itemsRetrieverMock.Setup(retriever => retriever.GetItemsAsync(deletionOperation.Tenant, deletionOperation.Subproject, deletionOperation.Query, cancellationSource.Token))
                          .ReturnsAsync(itemsToLockAndDelete);
        _ = lockManagerMock.Setup(manager => manager.AcquireDeleteLockAsync($"{deletionOperation.Tenant}/{deletionOperation.Subproject}/some/path1/Example1"))
               .ReturnsAsync(false);

        _ = lockManagerMock.Setup(manager => manager.AcquireDeleteLockAsync(GetLockKeyPrefix(deletionOperation) + "/some/path1/Example1"))
                       .ReturnsAsync(false);

        _ = lockManagerMock.Setup(manager => manager.AcquireDeleteLockAsync(GetLockKeyPrefix(deletionOperation) + "/some/path2/Example2"))
                       .ReturnsAsync(true);


        // Act
        await service.ProcessAsync(deletionOperation, cancellationSource.Token);

        // Assert
        taskStatusStorageMock.Verify(tss => tss.CreateDeletionOperationStatusAsync(deletionOperation, It.IsAny<CancellationToken>()), Times.Once);
        taskStatusStorageMock.Verify(tss => tss.UpdateFieldStatusOperationAsync(deletionOperation.OperationId, Constants.DeleteOperationStatus.DATASETS_CNT, "2", It.IsAny<CancellationToken>()), Times.Once);
        itemsRetrieverMock.Verify(retriever => retriever.GetItemsAsync(deletionOperation.Tenant, deletionOperation.Subproject, deletionOperation.Query, cancellationSource.Token), Times.Once);
        lockManagerMock.Verify(manager => manager.AcquireDeleteLockAsync(It.IsAny<string>()), Times.Exactly(6));
        bulkDeletionWorkerMock.Verify(worker => worker.RunBulkDeletionAsync(deletionOperation.Tenant, deletionOperation.OperationId, itemsToDelete, cancellationSource.Token), Times.Once);
        taskStatusStorageMock.Verify(tss => tss.UpdateFieldStatusOperationAsync(deletionOperation.OperationId, Constants.DeleteOperationStatus.STATUS, Status.CompletedWithErrors.ToString(), It.IsAny<CancellationToken>()), Times.Once);
        taskStatusStorageMock.Verify(tss => tss.UpdateFieldStatusOperationAsync(deletionOperation.OperationId, Constants.DeleteOperationStatus.STATUS_DESCRIPTION, Status.CompletedWithErrors.Description(), It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task ExecuteAsync_ItemLocked_ShouldIncreaseFailedCntAsync()
    {
        // Arrange
        var loggerMock = new Mock<ILogger<DeletionTaskExecutor>>();
        var taskStatusStorageMock = new Mock<IDeletionTaskStatusStorage>();
        var itemsRetrieverMock = new Mock<IItemsRetriever>();
        var bulkDeletionWorkerMock = new Mock<IBulkDeletionWorker>();
        var lockManagerMock = new Mock<ILockManager>();

        var service = new DeletionTaskExecutor(
            loggerMock.Object,
            taskStatusStorageMock.Object,
            itemsRetrieverMock.Object,
            bulkDeletionWorkerMock.Object,
            lockManagerMock.Object
        );

        var deletionOperation = InitializeStatus();
        var cancellationSource = new CancellationTokenSource();

        var itemsToDelete = new List<DeleteItem> {
            new DeleteItem
                {
                    Id = "123",
                    Gcsurl = "container/folder",
                    Path = "/some/path1/",
                    Name = "Example1"
                },
             new DeleteItem
                {
                    Id = "456",
                    Gcsurl = "container/folder",
                    Path = "/some/path2",
                    Name = "Example2"
                }
        };

        _ = taskStatusStorageMock.Setup(tss => tss.CreateDeletionOperationStatusAsync(deletionOperation, It.IsAny<CancellationToken>()))
            .ReturnsAsync(deletionOperation); // using the fact that in these tests deletionOperation is already DeleteOperationStatus

        _ = itemsRetrieverMock.Setup(retriever => retriever.GetItemsAsync(deletionOperation.Tenant, deletionOperation.Subproject, deletionOperation.Query, cancellationSource.Token))
                          .ReturnsAsync(itemsToDelete);

        _ = lockManagerMock.Setup(manager => manager.AcquireDeleteLockAsync(GetLockKeyPrefix(deletionOperation) + "/some/path1/Example1"))
                       .ReturnsAsync(false);

        _ = lockManagerMock.Setup(manager => manager.AcquireDeleteLockAsync(GetLockKeyPrefix(deletionOperation) + "/some/path2/Example2"))
                       .ReturnsAsync(true);

        // Act
        await service.ProcessAsync(deletionOperation, cancellationSource.Token);

        // Assert
        taskStatusStorageMock.Verify(tss => tss.CreateDeletionOperationStatusAsync(deletionOperation, It.IsAny<CancellationToken>()), Times.Once);
        taskStatusStorageMock.Verify(tss => tss.IncrementCountAsync(deletionOperation.OperationId, Constants.DeleteOperationStatus.FAILED_CNT, It.IsAny<CancellationToken>()), Times.Once());
        taskStatusStorageMock.Verify(tss => tss.UpdateFieldStatusOperationAsync(deletionOperation.OperationId, Constants.DeleteOperationStatus.STATUS, Status.CompletedWithErrors.ToString(), It.IsAny<CancellationToken>()), Times.Once);
        taskStatusStorageMock.Verify(tss => tss.UpdateFieldStatusOperationAsync(deletionOperation.OperationId, Constants.DeleteOperationStatus.STATUS_DESCRIPTION, Status.CompletedWithErrors.Description(), It.IsAny<CancellationToken>()), Times.Once);
    }

    private static DeleteOperationStatus InitializeStatus() => new()
    {
        OperationId = "operation123",
        Tenant = "tenant",
        Subproject = "subproject",
        Query = "SELECT c.id FROM c",
        CreatedAt = DateTime.UtcNow,
        LastUpdatedAt = DateTime.UtcNow,
        CreatedBy = "Sidecar.QueueHandlerRedis",
        Status = Status.Started.ToString(),
        StatusDescription = Status.Started.Description(),
        DatasetsCnt = 0,
        CompletedCnt = 0,
        FailedCnt = 0,
    };

    private static string GetLockKeyPrefix(IDeletionOperationMessage deleteOperation) => deleteOperation.Tenant + "/" + deleteOperation.Subproject;
}
