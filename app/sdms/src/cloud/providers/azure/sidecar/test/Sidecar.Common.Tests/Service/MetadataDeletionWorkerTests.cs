// ============================================================================
// Copyright 2017-2026, Microsoft Corporation
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
using Microsoft.Azure.Cosmos;

public class MetadataDeletionWorkerTests
{
    [Fact]
    public async Task DeleteMetadata_SuccessfulDeletion()
    {
        // Arrange
        var loggerMock = new Mock<ILogger<MetadataDeletionWorker>>();
        var dataAccessMock = new Mock<IDataAccess>();
        _ = dataAccessMock.Setup(d => d.DeleteMetadataAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string?>())).ReturnsAsync(true);

        var tenant = "tenant";
        var cs = "secret";

        var cosmosClientFactoryMock = new Mock<ICosmosClientFactory>();
        _ = cosmosClientFactoryMock.Setup(o => o.GetCosmosConnectionEndpointAsync(tenant, It.IsAny<CancellationToken>())).ReturnsAsync(cs);

        var archiveServiceMock = new Mock<IArchiveService>();

        var deletionWorker = new MetadataDeletionWorker(loggerMock.Object, dataAccessMock.Object, cosmosClientFactoryMock.Object, archiveServiceMock.Object);

        // Act
        await deletionWorker.DeleteMetadataAsync(tenant, "metadataId");

        // Assert
        dataAccessMock.Verify(d => d.DeleteMetadataAsync(cs, "metadataId", It.IsAny<string?>()), Times.Once);
        archiveServiceMock.Verify(a => a.ArchiveBeforeDeleteAsync(tenant, "metadataId", null), Times.Once);
    }

    [Fact]
    public async Task DeleteMetadata_FailureThenSuccess()
    {
        // Arrange
        var loggerMock = new Mock<ILogger<MetadataDeletionWorker>>();
        var dataAccessMock = new Mock<IDataAccess>();
        _ = dataAccessMock.SetupSequence(d => d.DeleteMetadataAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string?>()))
            .ThrowsAsync(new CosmosException("Error", System.Net.HttpStatusCode.NotFound, 0, "123", 0))
            .ReturnsAsync(true);

        var tenant = "tenant";
        var cs = "secret";

        var cosmosClientFactoryMock = new Mock<ICosmosClientFactory>();
        _ = cosmosClientFactoryMock.Setup(o => o.GetCosmosConnectionEndpointAsync(tenant, It.IsAny<CancellationToken>())).ReturnsAsync(cs);

        var archiveServiceMock = new Mock<IArchiveService>();

        var deletionWorker = new MetadataDeletionWorker(loggerMock.Object, dataAccessMock.Object, cosmosClientFactoryMock.Object, archiveServiceMock.Object);

        // Act
        await deletionWorker.DeleteMetadataAsync(tenant, "metadataId");

        // Assert
        dataAccessMock.Verify(d => d.DeleteMetadataAsync(cs, "metadataId", It.IsAny<string?>()), Times.Exactly(2));
    }

    [Fact]
    public async Task DeleteMetadata_ExceptionIsThrownAfterRetries()
    {
        // Arrange
        var loggerMock = new Mock<ILogger<MetadataDeletionWorker>>();
        var dataAccessMock = new Mock<IDataAccess>();
        _ = dataAccessMock.Setup(d => d.DeleteMetadataAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string?>()))
            .ThrowsAsync(new CosmosException("Error", System.Net.HttpStatusCode.NotFound, 0, "123", 0));

        var maxRetries = 5;

        var cosmosClientFactoryMock = new Mock<ICosmosClientFactory>();
        _ = cosmosClientFactoryMock.Setup(o => o.GetCosmosConnectionEndpointAsync("tenant", It.IsAny<CancellationToken>())).ReturnsAsync("cs");

        var archiveServiceMock = new Mock<IArchiveService>();

        var metadataDeletionWorker = new MetadataDeletionWorker(loggerMock.Object, dataAccessMock.Object, cosmosClientFactoryMock.Object, archiveServiceMock.Object);

        // Act & Assert
        _ = await Assert.ThrowsAsync<CosmosException>(async () => await metadataDeletionWorker.DeleteMetadataAsync("partitionId", "id"));

        // Assert that the DeleteMetadata method was called the expected number of times (MaxRetries)
        dataAccessMock.Verify(d => d.DeleteMetadataAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string?>()), Times.Exactly(maxRetries));
    }

    [Fact]
    public async Task DeleteMetadata_ArchivalFailure_PropagatesAndBlocksDeletion()
    {
        // Arrange
        var loggerMock = new Mock<ILogger<MetadataDeletionWorker>>();
        var dataAccessMock = new Mock<IDataAccess>();
        var cosmosClientFactoryMock = new Mock<ICosmosClientFactory>();
        _ = cosmosClientFactoryMock.Setup(o => o.GetCosmosConnectionEndpointAsync("tenant", It.IsAny<CancellationToken>())).ReturnsAsync("cs");

        var archiveServiceMock = new Mock<IArchiveService>();
        _ = archiveServiceMock
            .Setup(a => a.ArchiveBeforeDeleteAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string?>()))
            .ThrowsAsync(new InvalidOperationException("Archival failed"));

        var deletionWorker = new MetadataDeletionWorker(loggerMock.Object, dataAccessMock.Object, cosmosClientFactoryMock.Object, archiveServiceMock.Object);

        // Act & Assert — archival failure should propagate
        _ = await Assert.ThrowsAsync<InvalidOperationException>(
            async () => await deletionWorker.DeleteMetadataAsync("tenant", "metadataId"));

        // Verify deletion was never called (blocked by archival failure)
        dataAccessMock.Verify(d => d.DeleteMetadataAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string?>()), Times.Never);
    }
}
