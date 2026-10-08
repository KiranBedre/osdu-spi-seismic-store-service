// ============================================================================
// Copyright 2026, Microsoft Corporation
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

using Sidecar.Common.Model;

public class MetadataTierUpdaterTests
{
    [Fact]
    public async Task UpdateTier_ArchivalFailure_PropagatesAndBlocksTierChange()
    {
        // Arrange
        var loggerMock = new Mock<ILogger<MetadataTierUpdater>>();
        var dataAccessMock = new Mock<IDataAccess>();
        var cosmosClientFactoryMock = new Mock<ICosmosClientFactory>();
        _ = cosmosClientFactoryMock
            .Setup(o => o.GetCosmosConnectionEndpointAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync("cs");

        var archiveServiceMock = new Mock<IArchiveService>();
        _ = archiveServiceMock
            .Setup(a => a.ArchiveBeforeUpdateAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<ArchiveOperation>(), It.IsAny<string?>()))
            .ThrowsAsync(new InvalidOperationException("Archival failed"));

        var tierUpdater = new MetadataTierUpdater(
            loggerMock.Object, dataAccessMock.Object, cosmosClientFactoryMock.Object, archiveServiceMock.Object);

        // Act & Assert — archival failure should propagate
        _ = await Assert.ThrowsAsync<InvalidOperationException>(
            async () => await tierUpdater.UpdateTier("opendes", "ds-test-id", "Archive", "op-123"));

        // Verify tier update was never called (blocked by archival failure)
        dataAccessMock.Verify(
            d => d.UpdateMetadataAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<Dictionary<string, object>>(), It.IsAny<string?>()),
            Times.Never);
    }

    [Fact]
    public async Task UpdateTier_SuccessfulArchival_ProceedsWithTierChange()
    {
        // Arrange
        var loggerMock = new Mock<ILogger<MetadataTierUpdater>>();
        var dataAccessMock = new Mock<IDataAccess>();
        _ = dataAccessMock
            .Setup(d => d.UpdateMetadataAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<Dictionary<string, object>>(), It.IsAny<string?>()))
            .ReturnsAsync(true);

        var cosmosClientFactoryMock = new Mock<ICosmosClientFactory>();
        _ = cosmosClientFactoryMock
            .Setup(o => o.GetCosmosConnectionEndpointAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync("cs");

        var archiveServiceMock = new Mock<IArchiveService>();

        var tierUpdater = new MetadataTierUpdater(
            loggerMock.Object, dataAccessMock.Object, cosmosClientFactoryMock.Object, archiveServiceMock.Object);

        // Act
        await tierUpdater.UpdateTier("opendes", "ds-test-id", "Archive", "op-123");

        // Assert — both archival and update were called
        archiveServiceMock.Verify(
            a => a.ArchiveBeforeUpdateAsync("opendes", "ds-test-id", ArchiveOperation.change_tier, "op-123"), Times.Once);
        dataAccessMock.Verify(
            d => d.UpdateMetadataAsync("cs", "ds-test-id", It.IsAny<Dictionary<string, object>>(), "op-123"), Times.Once);
    }
}
