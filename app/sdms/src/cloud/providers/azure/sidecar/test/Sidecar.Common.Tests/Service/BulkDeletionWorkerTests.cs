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

using Azure;
using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;
using Azure.Storage.Blobs.Specialized;

namespace Sidecar.Common.Tests.Service
{
    public class BulkDeletionWorkerTests
    {
        [Fact]
        public void ParseContainerAndFolderName_Should_Parse_Correctly()
        {
            // Arrange
            var gcsurl = "container/folder";

            // Act
            var (containerName, virtualFolderName) = BulkDeletionWorker.ParseContainerAndFolderName(gcsurl);

            // Assert
            Assert.Equal("container", containerName);
            Assert.Equal("folder", virtualFolderName);
        }

        [Fact]
        public void ParseContainerAndFolderName_Should_Handle_No_Folder()
        {
            // Arrange
            var gcsurl = "container";

            // Act
            var (containerName, virtualFolderName) = BulkDeletionWorker.ParseContainerAndFolderName(gcsurl);

            // Assert
            Assert.Equal("container", containerName);
            Assert.Null(virtualFolderName);
        }

        [Theory]
        [InlineData(null)]
        [InlineData("/a/b/c")]
        public async Task ProcessItemDeletion_WithNullGcsUrl_IncrementsFailedCount(string gcsurl)
        {
            // Arrange
            var loggerMock = new Mock<ILogger<BulkDeletionWorker>>();
            var queueMock = new Mock<IQueueHandlerDeletion>();
            var metadataDeletionWorkerMock = new Mock<IMetadataDeletionWorker>();
            var blobClientMock = new Mock<IBlobClient>();

            var deletionWorker = new BulkDeletionWorker(
                loggerMock.Object,
                queueMock.Object,
                metadataDeletionWorkerMock.Object,
                blobClientMock.Object
            );

            var operationId = "123";
            var item = new DeleteItem { Id = "item123" };
            item.Gcsurl = gcsurl;
            var itemsToDelete = new List<DeleteItem> { item };

            // Act
            await deletionWorker.RunBulkDeletion(operationId, itemsToDelete);

            // Assert
            queueMock.Verify(q => q.IncrementCountAsync(operationId, "FailedCnt"), Times.Once);
            queueMock.Verify(q => q.UpdateFieldStatusOperation(operationId, "Status", Status.InProgress.ToString()), Times.Once);
            queueMock.Verify(q => q.UpdateFieldStatusOperation(operationId, "Status", Status.CompletedWithErrors.ToString()), Times.Once);
        }



        [Fact]
        public async Task RunBulkDeletion_Should_Work_With_EmptyItems()
        {
            // Arrange
            var loggerMock = new Mock<ILogger<BulkDeletionWorker>>();
            var queueMock = new Mock<IQueueHandlerDeletion>();
            var metadataDeletionWorkerMock = new Mock<IMetadataDeletionWorker>();
            var blobClientMock = new Mock<IBlobClient>();

            var bulkDeletionWorker = new BulkDeletionWorker(
                loggerMock.Object,
                queueMock.Object,
                metadataDeletionWorkerMock.Object,
                blobClientMock.Object
            );

            var itemsToDelete = new List<DeleteItem> { };
            
            // Act
            await bulkDeletionWorker.RunBulkDeletion("operationId", itemsToDelete);

            queueMock.Verify(
                queue => queue.IncrementCountAsync("operationId", It.IsAny<string>()),
               Times.Never);
            queueMock.Verify(q => q.UpdateFieldStatusOperation("operationId", "Status", Status.Completed.ToString()), Times.Once);

        }


        [Fact]
        public async Task RunBulkDeletion_Should_Work()
        {
            // Arrange
            var loggerMock = new Mock<ILogger<BulkDeletionWorker>>();
            var queueMock = new Mock<IQueueHandlerDeletion>();
            var metadataDeletionWorkerMock = new Mock<IMetadataDeletionWorker>();
            var blobClientMock = new Mock<IBlobClient>();
            var blobServiceClientMock = new Mock<BlobServiceClient>();
            var blobBatchClientMock = new Mock<BlobBatchClient>();
            var blobContainerClientMock = new Mock<BlobContainerClient>();
            var blobBatchMock = new Mock<BlobBatch>();


            var bulkDeletionWorker = new BulkDeletionWorker(
                loggerMock.Object,
                queueMock.Object,
                metadataDeletionWorkerMock.Object,
                blobClientMock.Object
            );

            var itemsToDelete = new List<DeleteItem> {
                new DeleteItem
                    {
                        Id = "123",
                        Gcsurl = "container/folder1",
                        Path = "/some/path",
                        Name = "Example"
                    },
                new DeleteItem
                    {
                        Id = "456",
                        Gcsurl = "container/folder2",
                        Path = "/some/path",
                        Name = "Example"
                    }
            };

            blobClientMock
                .Setup(client => client.GetBlobServiceClient())
                .Returns(blobServiceClientMock.Object);

            blobServiceClientMock
                .Setup(client => client.GetBlobContainerClient(It.IsAny<string>()))
                .Returns(blobContainerClientMock.Object);

            blobClientMock
                .Setup(client => client.GetBlobBatchClient())
                .Returns(blobBatchClientMock.Object);

            blobBatchClientMock
                .Setup(blobBatchClientMock => blobBatchClientMock.CreateBatch())
                .Returns(blobBatchMock.Object);

            blobBatchMock
                .Setup(b => b.DeleteBlob(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<DeleteSnapshotsOption>(), It.IsAny<BlobRequestConditions>()));

            var mockedBlobs = Page<BlobItem>.FromValues(new List<BlobItem>
            {
                BlobsModelFactory.BlobItem("mocked1"),
                BlobsModelFactory.BlobItem("mocked2")
            }, continuationToken: null, new Mock<Response>().Object);
            
            var mockedBlobsPages = AsyncPageable<BlobItem>.FromPages(new[] { mockedBlobs });

            blobContainerClientMock
                .Setup(client => client.GetBlobsAsync(It.IsAny<BlobTraits>(), It.IsAny<BlobStates>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
                .Returns(mockedBlobsPages);

            // Act
            await bulkDeletionWorker.RunBulkDeletion("operationId", itemsToDelete);

            queueMock.Verify(
                queue => queue.IncrementCountAsync("operationId", "DeletedCnt"),
                Times.Exactly(itemsToDelete.Count));

            queueMock.Verify(q => q.UpdateFieldStatusOperation("operationId", "Status", Status.InProgress.ToString()), Times.Once);
            queueMock.Verify(q => q.UpdateFieldStatusOperation("operationId", "Status", Status.Completed.ToString()), Times.Once);

        }

    }
}
