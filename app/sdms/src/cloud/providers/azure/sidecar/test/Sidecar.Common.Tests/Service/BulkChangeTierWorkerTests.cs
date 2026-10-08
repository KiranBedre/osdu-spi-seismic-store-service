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

public class BulkChangeTierWorkerTests
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
    public async Task ProcessItemChangeTier_WithInvalidGcsUrl_IncrementsFailedCount(string? gcsurl)
    {
        // Arrange
        var loggerMock = new Mock<ILogger<BulkChangeTierWorker>>();
        var statusStorageMock = new Mock<IChangeTierTaskStatusStorage>();
        var metadataChangeTierWorkerMock = new Mock<IMetadataTierUpdater>();
        var blobClientMock = new Mock<IBlobClientFactory>();

        var changeTierWorker = new BulkChangeTierWorker(
            loggerMock.Object,
            statusStorageMock.Object,
            metadataChangeTierWorkerMock.Object,
            blobClientMock.Object
        );

        var tenant = "someTenant";
        var operationId = "123";
        var item = new ChangeTierItem
        {
            Id = "item123",
            Gcsurl = gcsurl
        };
        var itemsToChangeTier = new List<ChangeTierItem> { item };

        var changeTierErrors = false;

        // Act
        var foundErrors = await changeTierWorker.RunBulkChangeTierAsync(tenant, operationId, "", itemsToChangeTier, CancellationToken.None);

        // Assert
        Assert.True(foundErrors);

        // Assert
        statusStorageMock.Verify(x => x.IncrementCountAsync(
            operationId, Constants.ChangeTierOperationStatus.FAILED_CNT, It.IsAny<CancellationToken>()), Times.Once);
        statusStorageMock.Verify(x => x.UpdateFieldStatusOperationAsync(
            operationId, Constants.ChangeTierOperationStatus.STATUS, Status.InProgress.ToString(), It.IsAny<CancellationToken>()), Times.Once);
        statusStorageMock.Verify(x => x.UpdateFieldStatusOperationAsync(
            operationId, Constants.ChangeTierOperationStatus.STATUS_DESCRIPTION, Status.InProgress.Description(), It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task RunBulkChangeTier_Should_Work_With_EmptyItems()
    {
        // Arrange
        var loggerMock = new Mock<ILogger<BulkChangeTierWorker>>();
        var statusStorageMock = new Mock<IChangeTierTaskStatusStorage>();
        var metadataChangeTierWorkerMock = new Mock<IMetadataTierUpdater>();
        var blobClientMock = new Mock<IBlobClientFactory>();

        var bulkChangeTierWorker = new BulkChangeTierWorker(
            loggerMock.Object,
            statusStorageMock.Object,
            metadataChangeTierWorkerMock.Object,
            blobClientMock.Object
        );

        var itemsToChangeTier = new List<ChangeTierItem> { };

        var changeTierErrors = false;

        var tenant = "opendes";
        var operationId = "123";

        // Act
        var foundErrors = await bulkChangeTierWorker.RunBulkChangeTierAsync(tenant, operationId, "", itemsToChangeTier, CancellationToken.None);

        // Assert
        Assert.False(foundErrors);

        statusStorageMock.Verify(
            x => x.IncrementCountAsync(operationId, It.IsAny<string>(), It.IsAny<CancellationToken>()),
           Times.Never);
    }

    [Fact]
    public async Task RunBulkChangeTier_Should_Work()
    {
        // Arrange
        var loggerMock = new Mock<ILogger<BulkChangeTierWorker>>();
        var statusStorageMock = new Mock<IChangeTierTaskStatusStorage>();
        var metadataChangeTierWorkerMock = new Mock<IMetadataTierUpdater>();
        var blobClientMock = new Mock<IBlobClient>();
        var blobClientFactoryMock = new Mock<IBlobClientFactory>();
        var blobBatchClientMock = new Mock<BlobBatchClient>();
        var blobContainerClientMock = new Mock<BlobContainerClient>();
        var blobBatchMock = new Mock<BlobBatch>();

        var tenant = "tenant";
        var operationId = "123";

        var bulkChangeTierWorker = new BulkChangeTierWorker(
            loggerMock.Object,
            statusStorageMock.Object,
            metadataChangeTierWorkerMock.Object,
            blobClientFactoryMock.Object
        );

        var itemsToChangeTier = new List<ChangeTierItem> {
            new() {
                    Id = "123",
                    Gcsurl = "container/folder1",
                    Path = "/some/path",
                    Name = "Example"
                },
            new() {
                    Id = "456",
                    Gcsurl = "container/folder2",
                    Path = "/some/path",
                    Name = "Example"
                }
        };

        var changeTierErrors = false;

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
            .Setup(b => b.SetBlobAccessTier(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<AccessTier>(), It.IsAny<RehydratePriority>(), It.IsAny<BlobRequestConditions>()));

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
        var foundErrors = await bulkChangeTierWorker.RunBulkChangeTierAsync(tenant, operationId, "", itemsToChangeTier, CancellationToken.None);

        // Assert
        Assert.False(foundErrors);
        statusStorageMock.Verify(x => x.IncrementCountAsync(
                operationId, Constants.ChangeTierOperationStatus.COMPLETED_CNT, It.IsAny<CancellationToken>()),
            Times.Exactly(itemsToChangeTier.Count));

        statusStorageMock.Verify(x => x.UpdateFieldStatusOperationAsync(
                operationId, Constants.ChangeTierOperationStatus.STATUS, Status.InProgress.ToString(), It.IsAny<CancellationToken>()),
            Times.Once);
        statusStorageMock.Verify(x => x.UpdateFieldStatusOperationAsync(
                operationId, Constants.ChangeTierOperationStatus.STATUS_DESCRIPTION, Status.InProgress.Description(), It.IsAny<CancellationToken>()),
            Times.Once);
    }

    [Fact]
    public async Task RunBulkChangeTier_WithFailedMetadata_Should_Work()
    {
        // Arrange
        var loggerMock = new Mock<ILogger<BulkChangeTierWorker>>();
        var statusStorageMock = new Mock<IChangeTierTaskStatusStorage>();
        var metadataChangeTierWorkerMock = new Mock<IMetadataTierUpdater>();
        var blobClientMock = new Mock<IBlobClient>();
        var blobClientFactoryMock = new Mock<IBlobClientFactory>();
        var blobBatchClientMock = new Mock<BlobBatchClient>();
        var blobContainerClientMock = new Mock<BlobContainerClient>();
        var blobBatchMock = new Mock<BlobBatch>();

        var tenant = "tenant";
        var operationId = "123";

        var bulkChangeTierWorker = new BulkChangeTierWorker(
            loggerMock.Object,
            statusStorageMock.Object,
            metadataChangeTierWorkerMock.Object,
            blobClientFactoryMock.Object
        );

        var itemsToChangeTier = new List<ChangeTierItem> {
            new() {
                    Id = "123",
                    Gcsurl = "container/folder1",
                    Path = "/some/path",
                    Name = "Example"
                }
        };

        var changeTierErrors = false;

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
            .Setup(b => b.SetBlobAccessTier(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<AccessTier>(), It.IsAny<RehydratePriority>(), It.IsAny<BlobRequestConditions>()));

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

        _ = metadataChangeTierWorkerMock
              .Setup(container => container.UpdateTier(
                  It.IsAny<string>(),
                  It.IsAny<string>(),
                  It.IsAny<string>(),
                  It.IsAny<string?>()))
              .ThrowsAsync(new CosmosException("Mocked exception", HttpStatusCode.NotFound, 123, "SomeActivityId", 0.0));

        // Act
        var foundErrors = await bulkChangeTierWorker.RunBulkChangeTierAsync(tenant, operationId, "", itemsToChangeTier, CancellationToken.None);

        //Assert
        Assert.True(foundErrors);
        statusStorageMock.Verify(x => x.IncrementCountAsync(
            operationId, Constants.ChangeTierOperationStatus.FAILED_CNT, It.IsAny<CancellationToken>()), Times.Once);

        statusStorageMock.Verify(x => x.UpdateFieldStatusOperationAsync(
            operationId, Constants.ChangeTierOperationStatus.STATUS, Status.InProgress.ToString(), It.IsAny<CancellationToken>()), Times.Once);
        statusStorageMock.Verify(x => x.UpdateFieldStatusOperationAsync(
            operationId, Constants.ChangeTierOperationStatus.STATUS_DESCRIPTION, Status.InProgress.Description(), It.IsAny<CancellationToken>()), Times.Once);
    }
}
