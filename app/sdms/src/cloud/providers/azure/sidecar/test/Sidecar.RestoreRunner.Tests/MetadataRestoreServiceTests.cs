// ============================================================================
// Copyright 2026, Microsoft
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

namespace Sidecar.RestoreRunner.Tests;

using Microsoft.Azure.Cosmos;
using Newtonsoft.Json.Linq;
using Constants = Sidecar.Common.Utility.Constants;

/// <summary>
/// Unit tests for <see cref="MetadataRestoreService"/>.
///
/// Covers constructor argument validation plus the public <c>FinalizeRestoreAsync</c> flow:
///   - deleted dataset → restore directly from the latest archived lifecycle,
///   - live dataset → archive current state then restore the selected snapshot,
///   - no matching snapshot → RestoreRejectedException,
///   - invalid restore point / sdPath → ArgumentException (before any Cosmos work),
///   - restore point at/before dataset creation → InvalidOperationException.
/// </summary>
public class MetadataRestoreServiceTests
{
    private const string Tenant = "opendes";
    private const string SdPath = "sd://opendes/subproj1/pathA/datasetX";
    private const string RestorePoint = "2026-06-01T00:00:00Z";
    private const string OperationId = "op-1";
    private const string Endpoint = "https://cosmos.example.com";
    private const long LatestLifecycleKey = 100L;
    private const long SnapshotVersionCreatedEpochMs = 150L;

    private readonly Mock<ILogger<MetadataRestoreService>> _loggerMock = new();
    private readonly Mock<ICosmosClientFactory> _cosmosClientFactoryMock = new();
    private readonly Mock<IArchivedSnapshotSelector> _selectorMock = new();

    private MetadataRestoreService CreateService() =>
        new(_loggerMock.Object, _cosmosClientFactoryMock.Object, _selectorMock.Object);

    // ------------------------------------------------------------------------
    // Constructor argument validation
    // ------------------------------------------------------------------------

    [Fact]
    public void Constructor_NullLogger_Throws()
    {
        var act = () => new MetadataRestoreService(
            null!,
            new Mock<ICosmosClientFactory>().Object,
            new Mock<IArchivedSnapshotSelector>().Object);

        _ = act.Should().Throw<ArgumentNullException>();
    }

    [Fact]
    public void Constructor_NullCosmosClientFactory_Throws()
    {
        var act = () => new MetadataRestoreService(
            new Mock<ILogger<MetadataRestoreService>>().Object,
            null!,
            new Mock<IArchivedSnapshotSelector>().Object);

        _ = act.Should().Throw<ArgumentNullException>();
    }

    [Fact]
    public void Constructor_NullSnapshotSelector_Throws()
    {
        var act = () => new MetadataRestoreService(
            new Mock<ILogger<MetadataRestoreService>>().Object,
            new Mock<ICosmosClientFactory>().Object,
            null!);

        _ = act.Should().Throw<ArgumentNullException>();
    }

    // ------------------------------------------------------------------------
    // FinalizeRestoreAsync — input validation (fails before any Cosmos work)
    // ------------------------------------------------------------------------

    [Fact]
    public async Task FinalizeRestoreAsync_InvalidRestorePoint_ThrowsArgumentException()
    {
        var service = CreateService();

        var act = () => service.FinalizeRestoreAsync(SdPath, "not-a-timestamp", OperationId, CancellationToken.None);

        _ = (await act.Should().ThrowAsync<ArgumentException>())
            .Which.ParamName.Should().Be("restorePointInTime");
        _cosmosClientFactoryMock.Verify(
            f => f.GetCosmosConnectionEndpointAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task FinalizeRestoreAsync_InvalidSdPath_ThrowsArgumentException()
    {
        var service = CreateService();

        var act = () => service.FinalizeRestoreAsync("not-an-sdpath", RestorePoint, OperationId, CancellationToken.None);

        _ = await act.Should().ThrowAsync<ArgumentException>();
        _cosmosClientFactoryMock.Verify(
            f => f.GetCosmosConnectionEndpointAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    // ------------------------------------------------------------------------
    // FinalizeRestoreAsync — deleted dataset (restore directly from archive)
    // ------------------------------------------------------------------------

    [Fact]
    public async Task FinalizeRestoreAsync_DeletedDataset_RestoresLatestArchivedSnapshot()
    {
        var (dataContainer, archiveContainer) = WireCosmos();

        // Data container returns no live document → dataset was deleted.
        SetupQueryIterator(dataContainer);

        // Latest lifecycle resolves, and a snapshot is selected for the restore point.
        _ = _selectorMock
            .Setup(s => s.ResolveLatestLifecycleKeyAsync(Endpoint, SdPath, It.IsAny<CancellationToken>()))
            .ReturnsAsync(LatestLifecycleKey);
        _ = _selectorMock
            .Setup(s => s.SelectSnapshotAsync(
                Endpoint, SdPath, It.IsAny<long>(), (long?)LatestLifecycleKey, OperationId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new ArchivedDatasetMetadata
            {
                Id = "datasetX__100__200",
                Document = JObject.Parse("{\"id\":\"datasetX\",\"data\":{\"name\":\"restored\"}}"),
                VersionCreatedAtEpochMs = SnapshotVersionCreatedEpochMs,
            });

        JObject? restored = null;
        _ = dataContainer
            .Setup(c => c.UpsertItemAsync(
                It.IsAny<JObject>(), It.IsAny<PartitionKey?>(), It.IsAny<ItemRequestOptions>(), It.IsAny<CancellationToken>()))
            .Callback<JObject, PartitionKey?, ItemRequestOptions?, CancellationToken>((doc, _, _, _) => restored = doc)
            .ReturnsAsync(Mock.Of<ItemResponse<JObject>>());

        var service = CreateService();

        await service.FinalizeRestoreAsync(SdPath, RestorePoint, OperationId, CancellationToken.None);

        // Selected the latest lifecycle and restored the snapshot document into the data container.
        _selectorMock.Verify(s => s.ResolveLatestLifecycleKeyAsync(Endpoint, SdPath, It.IsAny<CancellationToken>()), Times.Once);
        dataContainer.Verify(
            c => c.UpsertItemAsync(It.IsAny<JObject>(), It.IsAny<PartitionKey?>(), It.IsAny<ItemRequestOptions>(), It.IsAny<CancellationToken>()),
            Times.Once);
        // Deleted dataset: nothing to archive.
        archiveContainer.Verify(
            c => c.CreateItemAsync(It.IsAny<ArchivedDatasetMetadata>(), It.IsAny<PartitionKey?>(), It.IsAny<ItemRequestOptions>(), It.IsAny<CancellationToken>()),
            Times.Never);
        _ = restored.Should().NotBeNull();
        _ = restored!.Value<string>("id").Should().Be("datasetX");
    }

    [Fact]
    public async Task FinalizeRestoreAsync_NoSnapshotFound_ThrowsRestoreRejected()
    {
        var (dataContainer, _) = WireCosmos();
        SetupQueryIterator(dataContainer); // deleted dataset

        _ = _selectorMock
            .Setup(s => s.ResolveLatestLifecycleKeyAsync(Endpoint, SdPath, It.IsAny<CancellationToken>()))
            .ReturnsAsync((long?)null);
        _ = _selectorMock
            .Setup(s => s.SelectSnapshotAsync(
                It.IsAny<string>(), It.IsAny<string>(), It.IsAny<long>(), It.IsAny<long?>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((ArchivedDatasetMetadata?)null);

        var service = CreateService();

        var act = () => service.FinalizeRestoreAsync(SdPath, RestorePoint, OperationId, CancellationToken.None);

        _ = await act.Should().ThrowAsync<Sidecar.Common.Exceptions.RestoreRejectedException>();
    }

    // ------------------------------------------------------------------------
    // FinalizeRestoreAsync — live dataset (archive current state, then restore)
    // ------------------------------------------------------------------------

    [Fact]
    public async Task FinalizeRestoreAsync_LiveDataset_ArchivesCurrentThenRestoresSnapshot()
    {
        var (dataContainer, archiveContainer) = WireCosmos();

        // Data container returns a live document whose created_date precedes the restore point.
        var liveDoc = JObject.Parse(
            "{\"id\":\"datasetX\",\"_ts\":1735689600," +
            "\"data\":{\"name\":\"live\",\"created_date\":\"2025-01-01T00:00:00Z\"}}");
        SetupQueryIterator(dataContainer, liveDoc);

        // No existing archive snapshot for this operation → archive step proceeds.
        SetupQueryIterator(archiveContainer);

        ArchivedDatasetMetadata? archived = null;
        _ = archiveContainer
            .Setup(c => c.CreateItemAsync(
                It.IsAny<ArchivedDatasetMetadata>(), It.IsAny<PartitionKey?>(), It.IsAny<ItemRequestOptions>(), It.IsAny<CancellationToken>()))
            .Callback<ArchivedDatasetMetadata, PartitionKey?, ItemRequestOptions?, CancellationToken>((item, _, _, _) => archived = item)
            .ReturnsAsync(Mock.Of<ItemResponse<ArchivedDatasetMetadata>>());

        _ = _selectorMock
            .Setup(s => s.SelectSnapshotAsync(
                Endpoint, SdPath, It.IsAny<long>(), It.IsAny<long?>(), OperationId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new ArchivedDatasetMetadata
            {
                Id = "datasetX__1__2",
                Document = JObject.Parse("{\"id\":\"datasetX\",\"data\":{\"name\":\"restored\"}}"),
                VersionCreatedAtEpochMs = SnapshotVersionCreatedEpochMs,
            });

        _ = dataContainer
            .Setup(c => c.UpsertItemAsync(
                It.IsAny<JObject>(), It.IsAny<PartitionKey?>(), It.IsAny<ItemRequestOptions>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Mock.Of<ItemResponse<JObject>>());

        var service = CreateService();

        await service.FinalizeRestoreAsync(SdPath, RestorePoint, OperationId, CancellationToken.None);

        // Live state was archived (with the operation stamp) before the restore write.
        archiveContainer.Verify(
            c => c.CreateItemAsync(It.IsAny<ArchivedDatasetMetadata>(), It.IsAny<PartitionKey?>(), It.IsAny<ItemRequestOptions>(), It.IsAny<CancellationToken>()),
            Times.Once);
        dataContainer.Verify(
            c => c.UpsertItemAsync(It.IsAny<JObject>(), It.IsAny<PartitionKey?>(), It.IsAny<ItemRequestOptions>(), It.IsAny<CancellationToken>()),
            Times.Once);
        _ = archived.Should().NotBeNull();
        _ = archived!.OperationId.Should().Be(OperationId);
        _ = archived.SdPath.Should().Be(SdPath);
        _ = archived.Operation.Should().Be(Sidecar.Common.Model.ArchiveOperation.restore);
    }

    [Fact]
    public async Task FinalizeRestoreAsync_LiveDataset_ArchiveCreateConflict_TreatedAsIdempotent()
    {
        var (dataContainer, archiveContainer) = WireCosmos();

        // Live document present and eligible for archiving.
        var liveDoc = JObject.Parse(
            "{\"id\":\"datasetX\",\"_ts\":1735689600," +
            "\"data\":{\"name\":\"live\",\"created_date\":\"2025-01-01T00:00:00Z\"}}");
        SetupQueryIterator(dataContainer, liveDoc);

        // Existence pre-check finds nothing, so the archive create is attempted...
        SetupQueryIterator(archiveContainer);

        // ...but a concurrent/previous finalize of the SAME operation already wrote the snapshot
        // under the identical deterministic id, so Cosmos rejects this create with 409 Conflict.
        _ = archiveContainer
            .Setup(c => c.CreateItemAsync(
                It.IsAny<ArchivedDatasetMetadata>(), It.IsAny<PartitionKey?>(), It.IsAny<ItemRequestOptions>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new CosmosException("conflict", System.Net.HttpStatusCode.Conflict, 0, "activity", 1.0));

        _ = _selectorMock
            .Setup(s => s.SelectSnapshotAsync(
                Endpoint, SdPath, It.IsAny<long>(), It.IsAny<long?>(), OperationId, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new ArchivedDatasetMetadata
            {
                Id = "datasetX__1__2",
                Document = JObject.Parse("{\"id\":\"datasetX\",\"data\":{\"name\":\"restored\"}}"),
                VersionCreatedAtEpochMs = SnapshotVersionCreatedEpochMs,
            });

        _ = dataContainer
            .Setup(c => c.UpsertItemAsync(
                It.IsAny<JObject>(), It.IsAny<PartitionKey?>(), It.IsAny<ItemRequestOptions>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Mock.Of<ItemResponse<JObject>>());

        var service = CreateService();

        // The 409 is swallowed as idempotent success: finalize completes and still restores.
        await service.FinalizeRestoreAsync(SdPath, RestorePoint, OperationId, CancellationToken.None);

        dataContainer.Verify(
            c => c.UpsertItemAsync(It.IsAny<JObject>(), It.IsAny<PartitionKey?>(), It.IsAny<ItemRequestOptions>(), It.IsAny<CancellationToken>()),
            Times.Once);
    }

    [Fact]
    public async Task FinalizeRestoreAsync_LiveDataset_RestorePointAtOrBeforeCreation_ThrowsInvalidOperationException()
    {
        var (dataContainer, _) = WireCosmos();

        // created_date is AFTER the restore point → restore targets an earlier lifecycle → rejected.
        var liveDoc = JObject.Parse(
            "{\"id\":\"datasetX\",\"_ts\":1735689600," +
            "\"data\":{\"name\":\"live\",\"created_date\":\"2026-12-01T00:00:00Z\"}}");
        SetupQueryIterator(dataContainer, liveDoc);

        var service = CreateService();

        var act = () => service.FinalizeRestoreAsync(SdPath, RestorePoint, OperationId, CancellationToken.None);

        _ = await act.Should().ThrowAsync<InvalidOperationException>();
    }

    // ------------------------------------------------------------------------
    // Test plumbing
    // ------------------------------------------------------------------------

    private (Mock<Container> DataContainer, Mock<Container> ArchiveContainer) WireCosmos()
    {
        var dataContainer = new Mock<Container>();
        var archiveContainer = new Mock<Container>();
        var database = new Mock<Database>();
        var cosmosClient = new Mock<CosmosClient>();

        _ = database.Setup(d => d.GetContainer(Constants.CosmosDb.DATA_CONTAINER_ID)).Returns(dataContainer.Object);
        _ = database.Setup(d => d.GetContainer(Constants.CosmosDb.ARCHIVE_DATASET_METADATA_CONTAINER_ID)).Returns(archiveContainer.Object);
        _ = cosmosClient.Setup(c => c.GetDatabase(Constants.CosmosDb.DATABASE_ID)).Returns(database.Object);

        _ = _cosmosClientFactoryMock
            .Setup(f => f.GetCosmosConnectionEndpointAsync(Tenant, It.IsAny<CancellationToken>()))
            .ReturnsAsync(Endpoint);
        _ = _cosmosClientFactoryMock
            .Setup(f => f.GetCosmosClient(Endpoint))
            .Returns(cosmosClient.Object);

        return (dataContainer, archiveContainer);
    }

    /// <summary>
    /// Stubs <c>GetItemQueryIterator&lt;JObject&gt;</c> on the given container to return a single
    /// page containing <paramref name="items"/> (empty when none are supplied).
    /// </summary>
    private static void SetupQueryIterator(Mock<Container> container, params JObject[] items)
    {
        _ = container
            .Setup(c => c.GetItemQueryIterator<JObject>(
                It.IsAny<QueryDefinition>(), It.IsAny<string>(), It.IsAny<QueryRequestOptions>()))
            .Returns(MockQueryIterator(items));
    }

    private static FeedIterator<JObject> MockQueryIterator(IReadOnlyList<JObject> items)
    {
        var response = new Mock<FeedResponse<JObject>>();
        _ = response.Setup(r => r.Count).Returns(items.Count);
        _ = response.Setup(r => r.GetEnumerator()).Returns(() => items.GetEnumerator());

        var iterator = new Mock<FeedIterator<JObject>>();
        var served = false;
        _ = iterator.Setup(i => i.HasMoreResults).Returns(() => !served);
        _ = iterator
            .Setup(i => i.ReadNextAsync(It.IsAny<CancellationToken>()))
            .ReturnsAsync(response.Object)
            .Callback(() => served = true);

        return iterator.Object;
    }
}
