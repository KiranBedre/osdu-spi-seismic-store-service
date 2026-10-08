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

using Microsoft.Azure.Cosmos;

public class MetadataTierUpdateWorkerTests
{
    [Fact]
    public async Task TierUpdateMetadata_SuccessfulUpdate()
    {
        // Arrange
        var loggerMock = new Mock<ILogger<MetadataTierUpdater>>();
        var dataAccessMock = new Mock<IDataAccess>();
        _ = dataAccessMock.Setup(d => d.UpdateMetadataAsync(
            It.IsAny<string>(),
            It.IsAny<string>(),
            It.IsAny<Dictionary<string, object>>(),
            null)).ReturnsAsync(true);
        var archiveServiceMock = new Mock<IArchiveService>();

        var tenant = "tenant";
        var cs = "secret";

        var cosmosClientFactoryMock = new Mock<ICosmosClientFactory>();
        _ = cosmosClientFactoryMock.Setup(o =>
            o.GetCosmosConnectionEndpointAsync(tenant, It.IsAny<CancellationToken>())).ReturnsAsync(cs);

        var changeTierWorker = new MetadataTierUpdater(
            loggerMock.Object,
            dataAccessMock.Object,
            cosmosClientFactoryMock.Object,
            archiveServiceMock.Object);

        // Act
        await changeTierWorker.UpdateTier(tenant, "metadataId", "");

        // Assert
        dataAccessMock.Verify(d => d.UpdateMetadataAsync(
            cs,
            "metadataId",
            It.IsAny<Dictionary<string, object>>(),
            null), Times.Once);
    }

    [Fact]
    public async Task ChangeTierMetadata_FailureThenSuccess()
    {
        // Arrange
        var loggerMock = new Mock<ILogger<MetadataTierUpdater>>();
        var dataAccessMock = new Mock<IDataAccess>();
        _ = dataAccessMock.SetupSequence(d => d.UpdateMetadataAsync(
            It.IsAny<string>(),
            It.IsAny<string>(),
            It.IsAny<Dictionary<string, object>>(),
            null))
            .ThrowsAsync(new CosmosException("Error", System.Net.HttpStatusCode.NotFound, 0, "123", 0))
            .ReturnsAsync(true);
        var archiveServiceMock = new Mock<IArchiveService>();

        var tenant = "tenant";
        var cs = "secret";

        var cosmosClientFactoryMock = new Mock<ICosmosClientFactory>();
        _ = cosmosClientFactoryMock.Setup(o =>
            o.GetCosmosConnectionEndpointAsync(tenant, It.IsAny<CancellationToken>())).ReturnsAsync(cs);

        var changeTierWorker = new MetadataTierUpdater(
            loggerMock.Object,
            dataAccessMock.Object,
            cosmosClientFactoryMock.Object,
            archiveServiceMock.Object);

        // Act
        await changeTierWorker.UpdateTier(tenant, "metadataId", "");

        // Assert
        dataAccessMock.Verify(d => d.UpdateMetadataAsync(
            cs,
            "metadataId",
            It.IsAny<Dictionary<string, object>>(),
            null), Times.Exactly(2));
    }

    [Fact]
    public async Task ChangeTierMetadata_ExceptionIsThrownAfterRetries()
    {
        // Arrange
        var loggerMock = new Mock<ILogger<MetadataTierUpdater>>();
        var dataAccessMock = new Mock<IDataAccess>();
        _ = dataAccessMock.Setup(d => d.UpdateMetadataAsync(
            It.IsAny<string>(),
            It.IsAny<string>(),
            It.IsAny<Dictionary<string, object>>(),
            null))
            .ThrowsAsync(new CosmosException("Error", System.Net.HttpStatusCode.NotFound, 0, "123", 0));
        var archiveServiceMock = new Mock<IArchiveService>();

        var maxRetries = 5;

        var cosmosClientFactoryMock = new Mock<ICosmosClientFactory>();
        _ = cosmosClientFactoryMock.Setup(o =>
            o.GetCosmosConnectionEndpointAsync("tenant", It.IsAny<CancellationToken>())).ReturnsAsync("cs");

        var metadataChangeTierWorker = new MetadataTierUpdater(
            loggerMock.Object,
            dataAccessMock.Object,
            cosmosClientFactoryMock.Object,
            archiveServiceMock.Object);

        // Act & Assert
        _ = await Assert.ThrowsAsync<CosmosException>(async () => await metadataChangeTierWorker.UpdateTier("partitionId", "id", ""));

        // Assert that the DeleteMetadata method was called the expected number of times (MaxRetries)
        dataAccessMock.Verify(d => d.UpdateMetadataAsync(
            It.IsAny<string>(),
            It.IsAny<string>(),
            It.IsAny<Dictionary<string, object>>(),
            null), Times.Exactly(maxRetries));
    }
}
