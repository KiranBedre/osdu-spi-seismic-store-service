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

namespace Sidecar.Common.Tests.Service;

using Azure;
using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;
using Azure.Storage.Blobs.Specialized;
using Microsoft.Azure.Cosmos;
using Sidecar.Common.Service;
using Sidecar.Common.Utility;
using System.Net;

public class BulkDeletionWorkerTests
{
    [Fact]
    public void ParseContainerAndFolderName_Should_Parse_Correctly()
    {
        // Arrange
        var gcsurl = "container/folder";

        // Act
        var (containerName, virtualFolderName) = Utils.ParseContainerAndFolderName(gcsurl);

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
        var (containerName, virtualFolderName) = Utils.ParseContainerAndFolderName(gcsurl);

        // Assert
        Assert.Equal("container", containerName);
        Assert.Null(virtualFolderName);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("/a/b/c")]
    public async Task ProcessItemDeletion_WithInvalidGcsUrl_IncrementsFailedCount(string gcsurl)
    {
        // Arrange
        var loggerMock = new Mock<ILogger<BulkDeletionWorker>>();
        var statusStorageMock = new Mock<IDeletionTaskStatusStorage>();
        var metadataDeletionWorkerMock = new Mock<IMetadataDeletionWorker>();
        var blobClientMock = new Mock<IBlobClientFactory>();

        var deletionWorker = new BulkDeletionWorker(
            loggerMock.Object,
            statusStorageMock.Object,
            metadataDeletionWorkerMock.Object,
            blobClientMock.Object
        );

        var tenant = "someTenant";
        var operationId = "123";
        var item = new DeleteItem
        {
            Id = "item123",
            Gcsurl = gcsurl
        };
        var itemsToDelete = new List<DeleteItem> { item };

        // Act
        var foundErrors = await deletionWorker.RunBulkDeletionAsync(tenant, operationId, itemsToDelete, CancellationToken.None);

        // Assert
        Assert.True(foundErrors);

        // Assert
        statusStorageMock.Verify(x => x.IncrementCountAsync(
            operationId, Constants.DeleteOperationStatus.FAILED_CNT, It.IsAny<CancellationToken>()), Times.Once);
        statusStorageMock.Verify(x => x.UpdateFieldStatusOperationAsync(
            operationId, Constants.DeleteOperationStatus.STATUS, Status.InProgress.ToString(), It.IsAny<CancellationToken>()), Times.Once);
        statusStorageMock.Verify(x => x.UpdateFieldStatusOperationAsync(
            operationId, Constants.DeleteOperationStatus.STATUS_DESCRIPTION, Status.InProgress.Description(), It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task RunBulkDeletion_Should_Work_With_EmptyItems()
    {
        // Arrange
        var loggerMock = new Mock<ILogger<BulkDeletionWorker>>();
        var statusStorageMock = new Mock<IDeletionTaskStatusStorage>();
        var metadataDeletionWorkerMock = new Mock<IMetadataDeletionWorker>();
        var blobClientMock = new Mock<IBlobClientFactory>();

        var bulkDeletionWorker = new BulkDeletionWorker(
            loggerMock.Object,
            statusStorageMock.Object,
            metadataDeletionWorkerMock.Object,
            blobClientMock.Object
        );

        var itemsToDelete = new List<DeleteItem> { };

        var tenant = "opendes";
        var operationId = "123";

        // Act
        var foundErrors = await bulkDeletionWorker.RunBulkDeletionAsync(tenant, operationId, itemsToDelete, CancellationToken.None);

        // Assert
        Assert.False(foundErrors);

        statusStorageMock.Verify(
            x => x.IncrementCountAsync(operationId, It.IsAny<string>(), It.IsAny<CancellationToken>()),
           Times.Never);
    }

    [Fact]
    public async Task RunBulkDeletion_Should_Work()
    {
        // Arrange
        var loggerMock = new Mock<ILogger<BulkDeletionWorker>>();
        var statusStorageMock = new Mock<IDeletionTaskStatusStorage>();
        var metadataDeletionWorkerMock = new Mock<IMetadataDeletionWorker>();
        var blobClientMock = new Mock<IBlobClient>();
        var blobClientFactoryMock = new Mock<IBlobClientFactory>();
        var blobBatchClientMock = new Mock<BlobBatchClient>();
        var blobContainerClientMock = new Mock<BlobContainerClient>();
        var blobBatchMock = new Mock<BlobBatch>();

        var tenant = "tenant";
        var operationId = "123";

        var bulkDeletionWorker = new BulkDeletionWorker(
            loggerMock.Object,
            statusStorageMock.Object,
            metadataDeletionWorkerMock.Object,
            blobClientFactoryMock.Object
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

        _ = blobClientMock
            .Setup(client => client.GetContainerClient(It.IsAny<string>()))
            .Returns(blobContainerClientMock.Object);

        _ = blobClientMock
            .Setup(client => client.GetBatchClient())
            .Returns(blobBatchClientMock.Object);

        _ = blobClientFactoryMock
            .Setup(clientFactory => clientFactory.GetBlobClientAsync(tenant, It.IsAny<CancellationToken>()))
            .ReturnsAsync(blobClientMock.Object);

        _ = blobBatchMock
            .Setup(b => b.DeleteBlob(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<DeleteSnapshotsOption>(), It.IsAny<BlobRequestConditions>()));

        _ = blobBatchClientMock
            .Setup(blobBatchClientMock => blobBatchClientMock.CreateBatch())
            .Returns(blobBatchMock.Object);

        var mockedBlobs = Page<BlobItem>.FromValues(new List<BlobItem>
        {
            BlobsModelFactory.BlobItem("mocked1"),
            BlobsModelFactory.BlobItem("mocked2")
        }, continuationToken: null, new Mock<Response>().Object);

        var mockedBlobsPages = AsyncPageable<BlobItem>.FromPages(new[] { mockedBlobs });

        _ = blobContainerClientMock
            .Setup(clientFactory => clientFactory.GetBlobsAsync(It.IsAny<BlobTraits>(), It.IsAny<BlobStates>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .Returns(mockedBlobsPages);

        // Act
        var foundErrors = await bulkDeletionWorker.RunBulkDeletionAsync(tenant, operationId, itemsToDelete, CancellationToken.None);

        // Assert
        Assert.False(foundErrors);
        statusStorageMock.Verify(x => x.IncrementCountAsync(
                operationId, Constants.DeleteOperationStatus.COMPLETED_CNT, It.IsAny<CancellationToken>()),
            Times.Exactly(itemsToDelete.Count));

        statusStorageMock.Verify(x => x.UpdateFieldStatusOperationAsync(
                operationId, Constants.DeleteOperationStatus.STATUS, Status.InProgress.ToString(), It.IsAny<CancellationToken>()),
            Times.Once);
        statusStorageMock.Verify(x => x.UpdateFieldStatusOperationAsync(
                operationId, Constants.DeleteOperationStatus.STATUS_DESCRIPTION, Status.InProgress.Description(), It.IsAny<CancellationToken>()),
            Times.Once);
    }

    [Fact]
    public async Task RunBulkDeletion_WithFailedMetadata_Should_Work()
    {
        // Arrange
        var loggerMock = new Mock<ILogger<BulkDeletionWorker>>();
        var statusStorageMock = new Mock<IDeletionTaskStatusStorage>();
        var metadataDeletionWorkerMock = new Mock<IMetadataDeletionWorker>();
        var blobClientMock = new Mock<IBlobClient>();
        var blobClientFactoryMock = new Mock<IBlobClientFactory>();
        var blobBatchClientMock = new Mock<BlobBatchClient>();
        var blobContainerClientMock = new Mock<BlobContainerClient>();
        var blobBatchMock = new Mock<BlobBatch>();

        var tenant = "tenant";
        var operationId = "123";

        var bulkDeletionWorker = new BulkDeletionWorker(
            loggerMock.Object,
            statusStorageMock.Object,
            metadataDeletionWorkerMock.Object,
            blobClientFactoryMock.Object
        );

        var itemsToDelete = new List<DeleteItem> {
            new DeleteItem
                {
                    Id = "123",
                    Gcsurl = "container/folder1",
                    Path = "/some/path",
                    Name = "Example"
                }
        };

        _ = blobClientMock
            .Setup(client => client.GetContainerClient(It.IsAny<string>()))
            .Returns(blobContainerClientMock.Object);

        _ = blobClientMock
            .Setup(client => client.GetBatchClient())
            .Returns(blobBatchClientMock.Object);

        _ = blobClientFactoryMock
            .Setup(clientFactory => clientFactory.GetBlobClientAsync(tenant, It.IsAny<CancellationToken>()))
            .ReturnsAsync(blobClientMock.Object);

        _ = blobBatchMock
            .Setup(b => b.DeleteBlob(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<DeleteSnapshotsOption>(), It.IsAny<BlobRequestConditions>()));

        _ = blobBatchClientMock
            .Setup(blobBatchClientMock => blobBatchClientMock.CreateBatch())
            .Returns(blobBatchMock.Object);

        var mockedBlobs = Page<BlobItem>.FromValues(new List<BlobItem>
        {
            BlobsModelFactory.BlobItem("mocked1")
        }, continuationToken: null, new Mock<Response>().Object);

        var mockedBlobsPages = AsyncPageable<BlobItem>.FromPages(new[] { mockedBlobs });

        _ = blobContainerClientMock
            .Setup(clientFactory => clientFactory.GetBlobsAsync(It.IsAny<BlobTraits>(), It.IsAny<BlobStates>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .Returns(mockedBlobsPages);

        _ = metadataDeletionWorkerMock
              .Setup(container => container.DeleteMetadataAsync(It.IsAny<string>(), It.IsAny<string>()))
              .ThrowsAsync(new CosmosException("Mocked exception", HttpStatusCode.NotFound, 123, "SomeActivityId", 0.0));

        // Act
        var foundErrors = await bulkDeletionWorker.RunBulkDeletionAsync(tenant, operationId, itemsToDelete, CancellationToken.None);

        //Assert
        Assert.True(foundErrors);
        statusStorageMock.Verify(x => x.IncrementCountAsync(
            operationId, Constants.DeleteOperationStatus.FAILED_CNT, It.IsAny<CancellationToken>()), Times.Once);

        statusStorageMock.Verify(x => x.UpdateFieldStatusOperationAsync(
            operationId, Constants.DeleteOperationStatus.STATUS, Status.InProgress.ToString(), It.IsAny<CancellationToken>()), Times.Once);
        statusStorageMock.Verify(x => x.UpdateFieldStatusOperationAsync(
            operationId, Constants.DeleteOperationStatus.STATUS_DESCRIPTION, Status.InProgress.Description(), It.IsAny<CancellationToken>()), Times.Once);
    }
}
