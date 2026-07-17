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

using System.Net;
using Newtonsoft.Json.Linq;
using Microsoft.Azure.Cosmos;
using Sidecar.Common.Model;
using Sidecar.Common.Utility;

public class ArchiveServiceTests
{
    // Repeated fixture/plumbing literals (kept out of assertions, which stay literal)
    private const string FeatureFlagEnvVar = "FEATURE_FLAG_ENABLE_RESTORE";
    private const string Tenant = "opendes";
    private const string TestEndpoint = "https://test.documents.azure.com";

    private readonly Mock<ILogger<ArchiveService>> _loggerMock;
    private readonly Mock<ICosmosClientFactory> _cosmosClientFactoryMock;
    private readonly Mock<IArchivedSnapshotSelector> _selectorMock;

    public ArchiveServiceTests()
    {
        _loggerMock = new Mock<ILogger<ArchiveService>>();
        _cosmosClientFactoryMock = new Mock<ICosmosClientFactory>();
        _selectorMock = new Mock<IArchivedSnapshotSelector>();
    }

    // By default the selector reports no predecessor (Moq returns null for the unmocked
    // Task<long?>), so versionCreatedAt falls back to the dataset's created date.
    private ArchiveService CreateService() =>
        new(_loggerMock.Object, _cosmosClientFactoryMock.Object, _selectorMock.Object);

    [Fact]
    public async Task ArchiveBeforeUpdateAsync_WhenDisabled_DoesNothing()
    {
        // Arrange
        Environment.SetEnvironmentVariable(FeatureFlagEnvVar, "false");
        var service = CreateService();

        // Act
        await service.ArchiveBeforeUpdateAsync(Tenant, "dataset-1", ArchiveOperation.change_tier);

        // Assert - no cosmos calls made
        _cosmosClientFactoryMock.Verify(
            f => f.GetCosmosConnectionEndpointAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()),
            Times.Never);

        // Cleanup
        Environment.SetEnvironmentVariable(FeatureFlagEnvVar, null);
    }

    [Fact]
    public async Task ArchiveBeforeUpdateAsync_WhenEnabled_ArchivesExistingItem()
    {
        // Arrange
        Environment.SetEnvironmentVariable(FeatureFlagEnvVar, "true");

        var mockDataContainer = new Mock<Container>();
        var mockArchiveContainer = new Mock<Container>();
        var mockDatabase = new Mock<Database>();
        var mockCosmosClient = new Mock<CosmosClient>();

        var existingItem = JObject.Parse(
            "{\"id\":\"dataset-1\",\"data\":{\"name\":\"test\"," +
            "\"tenant\":\"opendes\",\"subproject\":\"test-subproject\",\"path\":\"/restore/\"," +
            "\"created_date\":\"Wed Jul 08 2026 10:07:15 GMT+0000 (Coordinated Universal Time)\"," +
            "\"last_modified_date\":\"Wed Jul 08 2026 10:14:53 GMT+0000 (Coordinated Universal Time)\"}," +
            "\"_ts\":1783509999}");
        var readResponse = new Mock<ItemResponse<JObject>>();
        readResponse.Setup(r => r.Resource).Returns(existingItem);
        readResponse.Setup(r => r.StatusCode).Returns(HttpStatusCode.OK);

        mockDataContainer
            .Setup(c => c.ReadItemAsync<JObject>("dataset-1", It.IsAny<PartitionKey>(), null, default))
            .ReturnsAsync(readResponse.Object);

        ArchivedDatasetMetadata? captured = null;
        mockArchiveContainer
            .Setup(c => c.CreateItemAsync(It.IsAny<ArchivedDatasetMetadata>(), It.IsAny<PartitionKey>(), null, default))
            .Callback<ArchivedDatasetMetadata, PartitionKey?, ItemRequestOptions?, CancellationToken>((item, pk, opts, ct) => captured = item)
            .ReturnsAsync(Mock.Of<ItemResponse<ArchivedDatasetMetadata>>());

        mockDatabase.Setup(d => d.GetContainer(Constants.CosmosDb.DATA_CONTAINER_ID)).Returns(mockDataContainer.Object);
        mockDatabase.Setup(d => d.GetContainer(Constants.CosmosDb.ARCHIVE_DATASET_METADATA_CONTAINER_ID)).Returns(mockArchiveContainer.Object);
        mockCosmosClient.Setup(c => c.GetDatabase(Constants.CosmosDb.DATABASE_ID)).Returns(mockDatabase.Object);

        _cosmosClientFactoryMock
            .Setup(f => f.GetCosmosConnectionEndpointAsync(Tenant, It.IsAny<CancellationToken>()))
            .ReturnsAsync(TestEndpoint);
        _cosmosClientFactoryMock
            .Setup(f => f.GetCosmosClient(TestEndpoint))
            .Returns(mockCosmosClient.Object);

        var service = CreateService();

        // Act
        await service.ArchiveBeforeUpdateAsync(Tenant, "dataset-1", ArchiveOperation.change_tier);

        // Assert
        mockDataContainer.Verify(
            c => c.ReadItemAsync<JObject>("dataset-1", It.IsAny<PartitionKey>(), null, default),
            Times.Once);
        mockArchiveContainer.Verify(
            c => c.CreateItemAsync(It.IsAny<ArchivedDatasetMetadata>(), It.IsAny<PartitionKey>(), null, default),
            Times.Once);

        // Snapshot stores the sd:// path, the datasetId, and the full document ({ id, data }).
        captured.Should().NotBeNull();
        captured!.SdPath.Should().Be("sd://opendes/test-subproject/restore/test");
        captured.Document!["id"]!.ToString().Should().Be("dataset-1");
        captured.Document!["data"]!["name"]!.ToString().Should().Be("test");
        captured.Document!["_ts"].Should().BeNull(); // system properties stripped
        captured.DatasetCreatedAtEpochMs.Should().Be(1783505235000); // created_date: Wed Jul 08 2026 10:07:15 UTC
        // First version of the lifecycle: the selector reports no predecessor, so versionCreatedAt
        // falls back to the dataset's created date rather than the second-truncated _ts.
        captured.VersionCreatedAtEpochMs.Should().Be(1783505235000);

        // Cleanup
        Environment.SetEnvironmentVariable(FeatureFlagEnvVar, null);
    }

    [Fact]
    public async Task ArchiveBeforeUpdateAsync_WhenPredecessorExists_UsesPredecessorArchivedAtAsWindowStart()
    {
        // Regression for the window-overlap bug: for any version after the first, the live-window
        // START must be the predecessor snapshot's archivedAt (millisecond-precise), NOT the live
        // document's _ts (Unix seconds). Sourcing it from _ts truncated to the second, which made
        // consecutive windows [versionCreatedAt, archivedAt) overlap by up to 999 ms; archive-on-write
        // now makes them exactly contiguous so every restore point maps to exactly one version.
        // Arrange
        Environment.SetEnvironmentVariable(FeatureFlagEnvVar, "true");

        var mockDataContainer = new Mock<Container>();
        var mockArchiveContainer = new Mock<Container>();
        var mockDatabase = new Mock<Database>();
        var mockCosmosClient = new Mock<CosmosClient>();

        var existingItem = JObject.Parse(
            "{\"id\":\"dataset-1\",\"data\":{\"name\":\"test\"," +
            "\"tenant\":\"opendes\",\"subproject\":\"test-subproject\",\"path\":\"/restore/\"," +
            "\"created_date\":\"Wed Jul 08 2026 10:07:15 GMT+0000 (Coordinated Universal Time)\"}," +
            "\"_ts\":1783509999}");
        var readResponse = new Mock<ItemResponse<JObject>>();
        readResponse.Setup(r => r.Resource).Returns(existingItem);
        readResponse.Setup(r => r.StatusCode).Returns(HttpStatusCode.OK);

        mockDataContainer
            .Setup(c => c.ReadItemAsync<JObject>("dataset-1", It.IsAny<PartitionKey>(), null, default))
            .ReturnsAsync(readResponse.Object);

        ArchivedDatasetMetadata? captured = null;
        mockArchiveContainer
            .Setup(c => c.CreateItemAsync(It.IsAny<ArchivedDatasetMetadata>(), It.IsAny<PartitionKey>(), null, default))
            .Callback<ArchivedDatasetMetadata, PartitionKey?, ItemRequestOptions?, CancellationToken>((item, pk, opts, ct) => captured = item)
            .ReturnsAsync(Mock.Of<ItemResponse<ArchivedDatasetMetadata>>());

        mockDatabase.Setup(d => d.GetContainer(Constants.CosmosDb.DATA_CONTAINER_ID)).Returns(mockDataContainer.Object);
        mockDatabase.Setup(d => d.GetContainer(Constants.CosmosDb.ARCHIVE_DATASET_METADATA_CONTAINER_ID)).Returns(mockArchiveContainer.Object);
        mockCosmosClient.Setup(c => c.GetDatabase(Constants.CosmosDb.DATABASE_ID)).Returns(mockDatabase.Object);

        _cosmosClientFactoryMock
            .Setup(f => f.GetCosmosConnectionEndpointAsync(Tenant, It.IsAny<CancellationToken>()))
            .ReturnsAsync(TestEndpoint);
        _cosmosClientFactoryMock
            .Setup(f => f.GetCosmosClient(TestEndpoint))
            .Returns(mockCosmosClient.Object);

        // Predecessor version was archived at this ms-precise instant (the boundary). Note it differs
        // from the second-truncated _ts*1000 (1783509999000), proving _ts is no longer the source.
        const long predecessorArchivedAtEpochMs = 1783509999806;
        _selectorMock
            .Setup(s => s.ResolveLatestArchivedAtAsync(
                TestEndpoint, "sd://opendes/test-subproject/restore/test", 1783505235000, It.IsAny<CancellationToken>()))
            .ReturnsAsync(predecessorArchivedAtEpochMs);

        var service = CreateService();

        // Act
        await service.ArchiveBeforeUpdateAsync(Tenant, "dataset-1", ArchiveOperation.change_tier);

        // Assert - window START equals the predecessor's archivedAt (contiguous, ms-precise),
        // so the two windows meet exactly at the boundary with no overlap and no gap.
        captured.Should().NotBeNull();
        captured!.VersionCreatedAtEpochMs.Should().Be(predecessorArchivedAtEpochMs);
        captured.DatasetCreatedAtEpochMs.Should().Be(1783505235000); // lifecycle key unchanged

        // Cleanup
        Environment.SetEnvironmentVariable(FeatureFlagEnvVar, null);
    }

    [Fact]
    public async Task ArchiveBeforeUpdateAsync_WhenNoDataWrapper_ArchivesWholeDocument()
    {
        // Regression: the primary item is read as a Newtonsoft JObject (the Cosmos
        // client serializes with Newtonsoft). If there is no nested "data" property,
        // archival must fall back to the whole document without throwing.
        // Arrange
        Environment.SetEnvironmentVariable(FeatureFlagEnvVar, "true");

        var mockDataContainer = new Mock<Container>();
        var mockArchiveContainer = new Mock<Container>();
        var mockDatabase = new Mock<Database>();
        var mockCosmosClient = new Mock<CosmosClient>();

        // Document without a "data" wrapper
        var existing = JObject.Parse("{\"id\":\"dataset-1\",\"name\":\"flat\"}");
        var readResponse = new Mock<ItemResponse<JObject>>();
        readResponse.Setup(r => r.Resource).Returns(existing);
        readResponse.Setup(r => r.StatusCode).Returns(HttpStatusCode.OK);

        mockDataContainer
            .Setup(c => c.ReadItemAsync<JObject>("dataset-1", It.IsAny<PartitionKey>(), null, default))
            .ReturnsAsync(readResponse.Object);

        ArchivedDatasetMetadata? captured = null;
        mockArchiveContainer
            .Setup(c => c.CreateItemAsync(It.IsAny<ArchivedDatasetMetadata>(), It.IsAny<PartitionKey>(), null, default))
            .Callback<ArchivedDatasetMetadata, PartitionKey?, ItemRequestOptions?, CancellationToken>((item, pk, opts, ct) => captured = item)
            .ReturnsAsync(Mock.Of<ItemResponse<ArchivedDatasetMetadata>>());

        mockDatabase.Setup(d => d.GetContainer(Constants.CosmosDb.DATA_CONTAINER_ID)).Returns(mockDataContainer.Object);
        mockDatabase.Setup(d => d.GetContainer(Constants.CosmosDb.ARCHIVE_DATASET_METADATA_CONTAINER_ID)).Returns(mockArchiveContainer.Object);
        mockCosmosClient.Setup(c => c.GetDatabase(Constants.CosmosDb.DATABASE_ID)).Returns(mockDatabase.Object);

        _cosmosClientFactoryMock
            .Setup(f => f.GetCosmosConnectionEndpointAsync(Tenant, It.IsAny<CancellationToken>()))
            .ReturnsAsync(TestEndpoint);
        _cosmosClientFactoryMock
            .Setup(f => f.GetCosmosClient(TestEndpoint))
            .Returns(mockCosmosClient.Object);

        var service = CreateService();

        // Act — must not throw
        await service.ArchiveBeforeUpdateAsync(Tenant, "dataset-1", ArchiveOperation.change_tier);

        // Assert — archival proceeds; whole document captured, timestamps default to 0
        captured.Should().NotBeNull();
        captured!.Operation.Should().Be(ArchiveOperation.change_tier);
        captured.Document.Should().NotBeNull();
        captured.Document!["name"]!.ToString().Should().Be("flat");
        captured.DatasetCreatedAtEpochMs.Should().Be(0);
        captured.VersionCreatedAtEpochMs.Should().Be(0);

        // Cleanup
        Environment.SetEnvironmentVariable(FeatureFlagEnvVar, null);
    }

    [Fact]
    public async Task ArchiveBeforeUpdateAsync_WhenItemNotFound_SkipsArchival()
    {
        // Arrange
        Environment.SetEnvironmentVariable(FeatureFlagEnvVar, "true");

        var mockDataContainer = new Mock<Container>();
        var mockArchiveContainer = new Mock<Container>();
        var mockDatabase = new Mock<Database>();
        var mockCosmosClient = new Mock<CosmosClient>();

        mockDataContainer
            .Setup(c => c.ReadItemAsync<JObject>("dataset-1", It.IsAny<PartitionKey>(), null, default))
            .ThrowsAsync(new CosmosException("Not found", HttpStatusCode.NotFound, 0, "test", 0));

        mockDatabase.Setup(d => d.GetContainer(Constants.CosmosDb.DATA_CONTAINER_ID)).Returns(mockDataContainer.Object);
        mockDatabase.Setup(d => d.GetContainer(Constants.CosmosDb.ARCHIVE_DATASET_METADATA_CONTAINER_ID)).Returns(mockArchiveContainer.Object);
        mockCosmosClient.Setup(c => c.GetDatabase(Constants.CosmosDb.DATABASE_ID)).Returns(mockDatabase.Object);

        _cosmosClientFactoryMock
            .Setup(f => f.GetCosmosConnectionEndpointAsync(Tenant, It.IsAny<CancellationToken>()))
            .ReturnsAsync(TestEndpoint);
        _cosmosClientFactoryMock
            .Setup(f => f.GetCosmosClient(TestEndpoint))
            .Returns(mockCosmosClient.Object);

        var service = CreateService();

        // Act
        await service.ArchiveBeforeUpdateAsync(Tenant, "dataset-1", ArchiveOperation.change_tier);

        // Assert - archive container should NOT be called
        mockArchiveContainer.Verify(
            c => c.CreateItemAsync(It.IsAny<ArchivedDatasetMetadata>(), It.IsAny<PartitionKey>(), null, default),
            Times.Never);

        // Cleanup
        Environment.SetEnvironmentVariable(FeatureFlagEnvVar, null);
    }

    [Fact]
    public async Task ArchiveBeforeDeleteAsync_WhenEnabled_ArchivesWithDeleteOperation()
    {
        // Arrange
        Environment.SetEnvironmentVariable(FeatureFlagEnvVar, "true");

        var mockDataContainer = new Mock<Container>();
        var mockArchiveContainer = new Mock<Container>();
        var mockDatabase = new Mock<Database>();
        var mockCosmosClient = new Mock<CosmosClient>();

        var existingItem = JObject.Parse("{\"id\":\"dataset-2\",\"data\":{\"name\":\"to-delete\"}}");
        var readResponse = new Mock<ItemResponse<JObject>>();
        readResponse.Setup(r => r.Resource).Returns(existingItem);
        readResponse.Setup(r => r.StatusCode).Returns(HttpStatusCode.OK);

        mockDataContainer
            .Setup(c => c.ReadItemAsync<JObject>("dataset-2", It.IsAny<PartitionKey>(), null, default))
            .ReturnsAsync(readResponse.Object);

        ArchivedDatasetMetadata? capturedArchivedDatasetMetadata = null;
        mockArchiveContainer
            .Setup(c => c.CreateItemAsync(It.IsAny<ArchivedDatasetMetadata>(), It.IsAny<PartitionKey>(), null, default))
            .Callback<ArchivedDatasetMetadata, PartitionKey?, ItemRequestOptions?, CancellationToken>((item, pk, opts, ct) =>
            {
                capturedArchivedDatasetMetadata = item;
            })
            .ReturnsAsync(Mock.Of<ItemResponse<ArchivedDatasetMetadata>>());

        mockDatabase.Setup(d => d.GetContainer(Constants.CosmosDb.DATA_CONTAINER_ID)).Returns(mockDataContainer.Object);
        mockDatabase.Setup(d => d.GetContainer(Constants.CosmosDb.ARCHIVE_DATASET_METADATA_CONTAINER_ID)).Returns(mockArchiveContainer.Object);
        mockCosmosClient.Setup(c => c.GetDatabase(Constants.CosmosDb.DATABASE_ID)).Returns(mockDatabase.Object);

        _cosmosClientFactoryMock
            .Setup(f => f.GetCosmosConnectionEndpointAsync(Tenant, It.IsAny<CancellationToken>()))
            .ReturnsAsync(TestEndpoint);
        _cosmosClientFactoryMock
            .Setup(f => f.GetCosmosClient(TestEndpoint))
            .Returns(mockCosmosClient.Object);

        var service = CreateService();

        // Act
        await service.ArchiveBeforeDeleteAsync(Tenant, "dataset-2");

        // Assert
        mockArchiveContainer.Verify(
            c => c.CreateItemAsync(It.IsAny<ArchivedDatasetMetadata>(), It.IsAny<PartitionKey>(), null, default),
            Times.Once);

        capturedArchivedDatasetMetadata.Should().NotBeNull();
        capturedArchivedDatasetMetadata!.SdPath.Should().Be("dataset-2");
        capturedArchivedDatasetMetadata.Operation.Should().Be(ArchiveOperation.bulk_delete);
        capturedArchivedDatasetMetadata.Ttl.Should().Be(2592000);

        // Cleanup
        Environment.SetEnvironmentVariable(FeatureFlagEnvVar, null);
    }

    [Fact]
    public async Task ArchiveBeforeUpdateAsync_WhenArchiveFails_ThrowsException()
    {
        // Arrange
        Environment.SetEnvironmentVariable(FeatureFlagEnvVar, "true");

        var mockDataContainer = new Mock<Container>();
        var mockArchiveContainer = new Mock<Container>();
        var mockDatabase = new Mock<Database>();
        var mockCosmosClient = new Mock<CosmosClient>();

        var existingItem = JObject.Parse("{\"id\":\"dataset-1\",\"data\":{}}");
        var readResponse = new Mock<ItemResponse<JObject>>();
        readResponse.Setup(r => r.Resource).Returns(existingItem);
        readResponse.Setup(r => r.StatusCode).Returns(HttpStatusCode.OK);

        mockDataContainer
            .Setup(c => c.ReadItemAsync<JObject>("dataset-1", It.IsAny<PartitionKey>(), null, default))
            .ReturnsAsync(readResponse.Object);

        mockArchiveContainer
            .Setup(c => c.CreateItemAsync(It.IsAny<ArchivedDatasetMetadata>(), It.IsAny<PartitionKey>(), null, default))
            .ThrowsAsync(new CosmosException("Write failed", HttpStatusCode.ServiceUnavailable, 0, "test", 0));

        mockDatabase.Setup(d => d.GetContainer(Constants.CosmosDb.DATA_CONTAINER_ID)).Returns(mockDataContainer.Object);
        mockDatabase.Setup(d => d.GetContainer(Constants.CosmosDb.ARCHIVE_DATASET_METADATA_CONTAINER_ID)).Returns(mockArchiveContainer.Object);
        mockCosmosClient.Setup(c => c.GetDatabase(Constants.CosmosDb.DATABASE_ID)).Returns(mockDatabase.Object);

        _cosmosClientFactoryMock
            .Setup(f => f.GetCosmosConnectionEndpointAsync(Tenant, It.IsAny<CancellationToken>()))
            .ReturnsAsync(TestEndpoint);
        _cosmosClientFactoryMock
            .Setup(f => f.GetCosmosClient(TestEndpoint))
            .Returns(mockCosmosClient.Object);

        var service = CreateService();

        // Act & Assert
        await Assert.ThrowsAsync<CosmosException>(
            () => service.ArchiveBeforeUpdateAsync(Tenant, "dataset-1", ArchiveOperation.change_tier));

        // Cleanup
        Environment.SetEnvironmentVariable(FeatureFlagEnvVar, null);
    }

    [Fact]
    public async Task ArchiveBeforeDeleteAsync_WhenDisabled_DoesNothing()
    {
        // Arrange
        Environment.SetEnvironmentVariable(FeatureFlagEnvVar, "false");
        var service = CreateService();

        // Act
        await service.ArchiveBeforeDeleteAsync(Tenant, "dataset-1");

        // Assert
        _cosmosClientFactoryMock.Verify(
            f => f.GetCosmosConnectionEndpointAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()),
            Times.Never);

        // Cleanup
        Environment.SetEnvironmentVariable(FeatureFlagEnvVar, null);
    }
}
