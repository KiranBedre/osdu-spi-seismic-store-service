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

    public ArchiveServiceTests()
    {
        _loggerMock = new Mock<ILogger<ArchiveService>>();
        _cosmosClientFactoryMock = new Mock<ICosmosClientFactory>();
    }

    [Fact]
    public async Task ArchiveBeforeUpdateAsync_WhenDisabled_DoesNothing()
    {
        // Arrange
        Environment.SetEnvironmentVariable(FeatureFlagEnvVar, "false");
        var service = new ArchiveService(_loggerMock.Object, _cosmosClientFactoryMock.Object);

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
            "\"created_date\":\"Wed Jul 08 2026 10:07:15 GMT+0000 (Coordinated Universal Time)\"," +
            "\"last_modified_date\":\"Wed Jul 08 2026 10:14:53 GMT+0000 (Coordinated Universal Time)\"}}");
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
        mockDatabase.Setup(d => d.GetContainer(Constants.CosmosDb.ARCHIVE_CONTAINER_ID)).Returns(mockArchiveContainer.Object);
        mockCosmosClient.Setup(c => c.GetDatabase(Constants.CosmosDb.DATABASE_ID)).Returns(mockDatabase.Object);

        _cosmosClientFactoryMock
            .Setup(f => f.GetCosmosConnectionEndpointAsync(Tenant, It.IsAny<CancellationToken>()))
            .ReturnsAsync(TestEndpoint);
        _cosmosClientFactoryMock
            .Setup(f => f.GetCosmosClient(TestEndpoint))
            .Returns(mockCosmosClient.Object);

        var service = new ArchiveService(_loggerMock.Object, _cosmosClientFactoryMock.Object);

        // Act
        await service.ArchiveBeforeUpdateAsync(Tenant, "dataset-1", ArchiveOperation.change_tier);

        // Assert
        mockDataContainer.Verify(
            c => c.ReadItemAsync<JObject>("dataset-1", It.IsAny<PartitionKey>(), null, default),
            Times.Once);
        mockArchiveContainer.Verify(
            c => c.CreateItemAsync(It.IsAny<ArchivedDatasetMetadata>(), It.IsAny<PartitionKey>(), null, default),
            Times.Once);

        // Snapshot captures the 'data' object and JS-format dates are parsed to epoch ms
        captured.Should().NotBeNull();
        captured!.Document!["name"]!.ToString().Should().Be("test");
        captured.DatasetCreatedAt.Should().Be(1783505235000); // Wed Jul 08 2026 10:07:15 UTC
        captured.VersionCreatedAt.Should().Be(1783505693000); // Wed Jul 08 2026 10:14:53 UTC

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
        mockDatabase.Setup(d => d.GetContainer(Constants.CosmosDb.ARCHIVE_CONTAINER_ID)).Returns(mockArchiveContainer.Object);
        mockCosmosClient.Setup(c => c.GetDatabase(Constants.CosmosDb.DATABASE_ID)).Returns(mockDatabase.Object);

        _cosmosClientFactoryMock
            .Setup(f => f.GetCosmosConnectionEndpointAsync(Tenant, It.IsAny<CancellationToken>()))
            .ReturnsAsync(TestEndpoint);
        _cosmosClientFactoryMock
            .Setup(f => f.GetCosmosClient(TestEndpoint))
            .Returns(mockCosmosClient.Object);

        var service = new ArchiveService(_loggerMock.Object, _cosmosClientFactoryMock.Object);

        // Act — must not throw
        await service.ArchiveBeforeUpdateAsync(Tenant, "dataset-1", ArchiveOperation.change_tier);

        // Assert — archival proceeds; whole document captured, timestamps default to 0
        captured.Should().NotBeNull();
        captured!.Operation.Should().Be(ArchiveOperation.change_tier);
        captured.Document.Should().NotBeNull();
        captured.Document!["name"]!.ToString().Should().Be("flat");
        captured.DatasetCreatedAt.Should().Be(0);
        captured.VersionCreatedAt.Should().Be(0);

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
        mockDatabase.Setup(d => d.GetContainer(Constants.CosmosDb.ARCHIVE_CONTAINER_ID)).Returns(mockArchiveContainer.Object);
        mockCosmosClient.Setup(c => c.GetDatabase(Constants.CosmosDb.DATABASE_ID)).Returns(mockDatabase.Object);

        _cosmosClientFactoryMock
            .Setup(f => f.GetCosmosConnectionEndpointAsync(Tenant, It.IsAny<CancellationToken>()))
            .ReturnsAsync(TestEndpoint);
        _cosmosClientFactoryMock
            .Setup(f => f.GetCosmosClient(TestEndpoint))
            .Returns(mockCosmosClient.Object);

        var service = new ArchiveService(_loggerMock.Object, _cosmosClientFactoryMock.Object);

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
        mockDatabase.Setup(d => d.GetContainer(Constants.CosmosDb.ARCHIVE_CONTAINER_ID)).Returns(mockArchiveContainer.Object);
        mockCosmosClient.Setup(c => c.GetDatabase(Constants.CosmosDb.DATABASE_ID)).Returns(mockDatabase.Object);

        _cosmosClientFactoryMock
            .Setup(f => f.GetCosmosConnectionEndpointAsync(Tenant, It.IsAny<CancellationToken>()))
            .ReturnsAsync(TestEndpoint);
        _cosmosClientFactoryMock
            .Setup(f => f.GetCosmosClient(TestEndpoint))
            .Returns(mockCosmosClient.Object);

        var service = new ArchiveService(_loggerMock.Object, _cosmosClientFactoryMock.Object);

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
        mockDatabase.Setup(d => d.GetContainer(Constants.CosmosDb.ARCHIVE_CONTAINER_ID)).Returns(mockArchiveContainer.Object);
        mockCosmosClient.Setup(c => c.GetDatabase(Constants.CosmosDb.DATABASE_ID)).Returns(mockDatabase.Object);

        _cosmosClientFactoryMock
            .Setup(f => f.GetCosmosConnectionEndpointAsync(Tenant, It.IsAny<CancellationToken>()))
            .ReturnsAsync(TestEndpoint);
        _cosmosClientFactoryMock
            .Setup(f => f.GetCosmosClient(TestEndpoint))
            .Returns(mockCosmosClient.Object);

        var service = new ArchiveService(_loggerMock.Object, _cosmosClientFactoryMock.Object);

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
        var service = new ArchiveService(_loggerMock.Object, _cosmosClientFactoryMock.Object);

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
