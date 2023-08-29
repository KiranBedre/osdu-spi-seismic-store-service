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


using Sidecar.Common.Utility;
using System.Reflection;

namespace Sidecar.Common.Tests.Service
{
    public class DeletionOperationServiceTests
    {
        [Fact]
        public void ExecuteAsync_Should_Process_Deletion_Operation()
        {
            // Arrange
            var loggerMock = new Mock<ILogger<DeletionOperationService>>();
            var queueMock = new Mock<IDeletionTasksStorage>();
            var itemsRetrieverMock = new Mock<IItemsRetriever>();
            var bulkDeletionWorkerMock = new Mock<IBulkDeletionWorker>();
            var lockManagerMock = new Mock<ILockManager>();

            var service = new DeletionOperationService(
                loggerMock.Object,
                queueMock.Object,
                itemsRetrieverMock.Object,
                bulkDeletionWorkerMock.Object,
                lockManagerMock.Object
            );

            var cancellationSource = new CancellationTokenSource();

            DeleteOperationStatus deletionOperation = InitializeStatus();

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
                    }
            };


            queueMock.Setup(queue => queue.CheckForDeletionOperationAsync()).ReturnsAsync(deletionOperation);
            itemsRetrieverMock.Setup(retriever => retriever.GetItems(deletionOperation.Tenant, deletionOperation.Subproject, deletionOperation.Path, cancellationSource.Token))
                              .ReturnsAsync(itemsToDelete);

            lockManagerMock.Setup(manager => manager.AcquireDeleteLock(It.IsAny<string>()))
                           .ReturnsAsync(true);

            MethodInfo methodInfo = GetMethodUnderTest("ExecuteAsync");

            // Act
            var result = methodInfo.Invoke(service, new object[] { cancellationSource.Token });

            // Assert
            itemsRetrieverMock.Verify(retriever => retriever.GetItems(deletionOperation.Tenant, deletionOperation.Subproject, deletionOperation.Path, cancellationSource.Token), Times.Once);
            lockManagerMock.Verify(manager => manager.AcquireDeleteLock(It.IsAny<string>()), Times.Exactly(itemsToDelete.Count));
            bulkDeletionWorkerMock.Verify(worker => worker.RunBulkDeletion(deletionOperation.Tenant, deletionOperation.OperationId, itemsToDelete, cancellationSource.Token), Times.Once);
            Assert.Equal(2, itemsToDelete.Count);
            queueMock.Verify(q => q.UpdateFieldStatusOperation(deletionOperation.OperationId, Constants.DeleteOperationStatus.DatasetsCnt, itemsToDelete.Count.ToString()), Times.Once);
        }

        [Fact]
        public void ExecuteAsync_WithoutAcquiringLock_And_No_Slashes_Should_Process_Deletion_For_Free_Ones()
        {
            // Arrange
            var loggerMock = new Mock<ILogger<DeletionOperationService>>();
            var queueMock = new Mock<IDeletionTasksStorage>();
            var itemsRetrieverMock = new Mock<IItemsRetriever>();
            var bulkDeletionWorkerMock = new Mock<IBulkDeletionWorker>();
            var lockManagerMock = new Mock<ILockManager>();

            var service = new DeletionOperationService(
                loggerMock.Object,
                queueMock.Object,
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


            queueMock.Setup(queue => queue.CheckForDeletionOperationAsync()).ReturnsAsync(deletionOperation);
            itemsRetrieverMock.Setup(retriever => retriever.GetItems(deletionOperation.Tenant, deletionOperation.Subproject, deletionOperation.Path, cancellationSource.Token))
                              .ReturnsAsync(itemsToDelete);

            lockManagerMock.Setup(manager => manager.AcquireDeleteLock("/some/path1/Example1"))
                           .ReturnsAsync(false);

            lockManagerMock.Setup(manager => manager.AcquireDeleteLock("/some/path2/Example2"))
                           .ReturnsAsync(true);


            MethodInfo methodInfo = GetMethodUnderTest("ExecuteAsync");

            // Act
            var result = methodInfo.Invoke(service, new object[] { cancellationSource.Token });

            // Assert
            queueMock.Verify(q => q.UpdateFieldStatusOperation(deletionOperation.OperationId, Constants.DeleteOperationStatus.DatasetsCnt, "2"), Times.Once);
            itemsRetrieverMock.Verify(retriever => retriever.GetItems(deletionOperation.Tenant, deletionOperation.Subproject, deletionOperation.Path, cancellationSource.Token), Times.Once);
            lockManagerMock.Verify(manager => manager.AcquireDeleteLock(It.IsAny<string>()), Times.Exactly(2));
            bulkDeletionWorkerMock.Verify(worker => worker.RunBulkDeletion(deletionOperation.Tenant, deletionOperation.OperationId, itemsToDelete, cancellationSource.Token), Times.Once);
            Assert.Single(itemsToDelete);
        }

        [Fact]
        public void ExecuteAsync_ItemLocked_ShouldIncreaseFailedCnt()
        {
            // Arrange
            var loggerMock = new Mock<ILogger<DeletionOperationService>>();
            var queueMock = new Mock<IDeletionTasksStorage>();
            var itemsRetrieverMock = new Mock<IItemsRetriever>();
            var bulkDeletionWorkerMock = new Mock<IBulkDeletionWorker>();
            var lockManagerMock = new Mock<ILockManager>();

            var service = new DeletionOperationService(
                loggerMock.Object,
                queueMock.Object,
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

            queueMock.Setup(queue => queue.CheckForDeletionOperationAsync()).ReturnsAsync(deletionOperation);
            itemsRetrieverMock.Setup(retriever => retriever.GetItems(deletionOperation.Tenant, deletionOperation.Subproject, deletionOperation.Path, cancellationSource.Token))
                              .ReturnsAsync(itemsToDelete);

            lockManagerMock.Setup(manager => manager.AcquireDeleteLock("/some/path1/Example1"))
                           .ReturnsAsync(false);

            lockManagerMock.Setup(manager => manager.AcquireDeleteLock("/some/path2/Example2"))
                           .ReturnsAsync(true);

            MethodInfo methodInfo = GetMethodUnderTest("ExecuteAsync");

            // Act
            var result = methodInfo.Invoke(service, new object[] { cancellationSource.Token });

            // Assert
            queueMock.Verify(queue => queue.IncrementCountAsync(deletionOperation.OperationId, Constants.DeleteOperationStatus.FailedCnt), Times.Once());
        }

        private static MethodInfo GetMethodUnderTest(string methodName)
        {
            var methodInfo = typeof(DeletionOperationService).GetMethod(methodName, BindingFlags.NonPublic | BindingFlags.Instance);
            if (methodInfo == null)
            {
                throw new InvalidOperationException("Method not found.");
            }

            return methodInfo;
        }

        private static DeleteOperationStatus InitializeStatus()
        {
            return new DeleteOperationStatus
            {
                OperationId = "operation123",
                Tenant = "tenant",
                Subproject = "subproject",
                Path = "/path/",
                CreatedAt = DateTime.UtcNow,
                LastUpdatedAt = DateTime.UtcNow,
                CreatedBy = "Sidecar.QueueHanderRedis",
                Status = Status.Started.ToString(),
                StatusDescription = Status.Started.Description(),
                DatasetsCnt = 0,
                DeletedCnt = 0,
                FailedCnt = 0
            };
        }

    }
}
