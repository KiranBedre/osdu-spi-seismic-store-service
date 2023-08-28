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
        }
    }
}
