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

namespace Sidecar.Common.Tests.Service;

using Newtonsoft.Json.Linq;
using Sidecar.Common.Exceptions;
using Sidecar.Common.Utility;

/// <summary>
/// Direct unit tests for <see cref="CosmosDatasetStorageInfoProvider.ResolveDatasetInfoAsync"/>.
///
/// The provider depends only on mockable abstractions (<see cref="IDataAccess"/>,
/// <see cref="ICosmosClientFactory"/>, <see cref="IArchivedSnapshotSelector"/>) — it never touches
/// the raw Cosmos SDK — so the full resolve flow (live vs. archived selection, out-of-range
/// rejection, gcsurl → container/virtual-folder mapping, filemetadata → expected-content
/// extraction, and access-policy inference) is exercised end to end here.
/// All timestamps use ISO-8601 UTC.
/// </summary>
public class CosmosDatasetStorageInfoProviderTests
{
    private const string SdPath = "sd://tenant1/subproj1/path1/dataset1";
    private const string OperationId = "op-1";
    private const string Endpoint = "https://cosmos.example/";

    // created_date < last_modified_date (current version start). Restore points are chosen relative
    // to these to drive each RestoreVersionSelector outcome.
    private const string CreatedDate = "2026-01-01T00:00:00Z";
    private const string VersionStartDate = "2026-02-01T00:00:00Z";
    private const string PointInCurrentWindow = "2026-03-01T00:00:00Z";   // > versionStart => live
    private const string PointBeforeCreation = "2025-12-01T00:00:00Z";    // <= created  => reject
    private const string PointInDeletionGap = "2026-01-15T00:00:00Z";     // >created, <versionStart

    private readonly Mock<ILogger<CosmosDatasetStorageInfoProvider>> _logger = new();
    private readonly Mock<IDataAccess> _dataAccess = new();
    private readonly Mock<ICosmosClientFactory> _cosmosClientFactory = new();
    private readonly Mock<IArchivedSnapshotSelector> _snapshotSelector = new();

    public CosmosDatasetStorageInfoProviderTests()
        => _cosmosClientFactory
            .Setup(f => f.GetCosmosConnectionEndpointAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(Endpoint);

    private CosmosDatasetStorageInfoProvider CreateSut()
        => new(_logger.Object, _dataAccess.Object, _cosmosClientFactory.Object, _snapshotSelector.Object);

    // ------------------------------------------------------------------------
    // Live-window storage selection & dataset-policy gcsurl inference
    // ------------------------------------------------------------------------

    [Fact]
    public async Task ResolveDatasetInfoAsync_LiveDataset_PointInCurrentWindow_UsesLiveStorageInfo()
    {
        SetupLiveRecord(gcsurl: "sharedcontainer/uuid-123", filemetadata: new { nobjects = 5, size = 1024 });
        SetupArchiveLookup(snapshot: null);
        var sut = CreateSut();

        var result = await sut.ResolveDatasetInfoAsync(
            SdPath, PointInCurrentWindow, OperationId, CancellationToken.None);

        _ = result.ContainerName.Should().Be("sharedcontainer");
        _ = result.VirtualFolder.Should().Be("uuid-123");
        _ = result.ExpectedObjectCount.Should().Be(5);
        _ = result.ExpectedTotalSize.Should().Be(1024);
    }

    [Fact]
    public async Task ResolveDatasetInfoAsync_DatasetPolicyGcsurl_InfersDatasetPolicy_NoVirtualFolder()
    {
        // A dataset-access-policy gcsurl has no "/" (dedicated container, uuid appended to the name).
        // Exercised through the archived-snapshot path (the live window is now a rejection).
        SetupNoLiveRecord();
        SetupArchiveLookup(snapshot: ArchivedSnapshot(gcsurl: "container-uuid-123", filemetadata: new { nobjects = 2, size = 512 }));
        var sut = CreateSut();

        var result = await sut.ResolveDatasetInfoAsync(SdPath, PointInCurrentWindow, OperationId, CancellationToken.None);

        _ = result.ContainerName.Should().Be("container-uuid-123");
        _ = result.VirtualFolder.Should().BeNull();
        _ = result.AccessPolicy.Should().Be(Constants.AccessPolicy.DATASET);
    }

    // ------------------------------------------------------------------------
    // Archived-snapshot selection
    // ------------------------------------------------------------------------

    [Fact]
    public async Task ResolveDatasetInfoAsync_ArchivedSnapshotCoversPoint_ReturnsArchivedStorageInfo()
    {
        // Live dataset exists, but a covering archived version wins (archive-interval-first).
        SetupLiveRecord(gcsurl: "livecontainer/live-uuid", filemetadata: new { nobjects = 5, size = 1024 });
        SetupArchiveLookup(snapshot: ArchivedSnapshot(gcsurl: "archivecontainer/arch-uuid", filemetadata: new { nobjects = 9, size = 4096 }));
        var sut = CreateSut();

        var result = await sut.ResolveDatasetInfoAsync(SdPath, PointInCurrentWindow, OperationId, CancellationToken.None);

        // Values come from the archived document, not the live record.
        _ = result.ContainerName.Should().Be("archivecontainer");
        _ = result.VirtualFolder.Should().Be("arch-uuid");
        _ = result.ExpectedObjectCount.Should().Be(9);
        _ = result.ExpectedTotalSize.Should().Be(4096);
        // Live document still exists, so the dataset is not deleted even though we restored a past version.
        _ = result.IsDeleted.Should().BeFalse();
    }

    [Fact]
    public async Task ResolveDatasetInfoAsync_DeletedDataset_ArchivedSnapshotCoversPoint_ReturnsArchived_IsDeletedTrue()
    {
        SetupNoLiveRecord();
        _snapshotSelector
            .Setup(s => s.ResolveLatestLifecycleKeyAsync(Endpoint, SdPath, It.IsAny<CancellationToken>()))
            .ReturnsAsync(1000L);
        SetupArchiveLookup(snapshot: ArchivedSnapshot(gcsurl: "archivecontainer/arch-uuid", filemetadata: new { nobjects = 3, size = 300 }));
        var sut = CreateSut();

        var result = await sut.ResolveDatasetInfoAsync(SdPath, PointInCurrentWindow, OperationId, CancellationToken.None);

        _ = result.ContainerName.Should().Be("archivecontainer");
        _ = result.ExpectedObjectCount.Should().Be(3);
        _ = result.IsDeleted.Should().BeTrue();
    }

    // ------------------------------------------------------------------------
    // Out-of-range rejections
    // ------------------------------------------------------------------------

    [Fact]
    public async Task ResolveDatasetInfoAsync_DeletedDataset_NoArchivedSnapshot_Throws()
    {
        SetupNoLiveRecord();
        _snapshotSelector
            .Setup(s => s.ResolveLatestLifecycleKeyAsync(Endpoint, SdPath, It.IsAny<CancellationToken>()))
            .ReturnsAsync((long?)null);
        SetupArchiveLookup(snapshot: null);
        var sut = CreateSut();

        var act = () => sut.ResolveDatasetInfoAsync(SdPath, PointInCurrentWindow, OperationId, CancellationToken.None);

        _ = (await act.Should().ThrowAsync<RestoreRejectedException>())
            .Which.Message.Should().Contain("No dataset version existed");
    }

    [Fact]
    public async Task ResolveDatasetInfoAsync_LiveDataset_PointBeforeCreation_Throws()
    {
        SetupLiveRecord(gcsurl: "c/f", filemetadata: new { nobjects = 1, size = 1 });
        SetupArchiveLookup(snapshot: null);
        var sut = CreateSut();

        var act = () => sut.ResolveDatasetInfoAsync(SdPath, PointBeforeCreation, OperationId, CancellationToken.None);

        _ = (await act.Should().ThrowAsync<RestoreRejectedException>())
            .Which.Message.Should().Contain("at or before the dataset's creation");
    }

    [Fact]
    public async Task ResolveDatasetInfoAsync_LiveDataset_PointInDeletionGap_Throws()
    {
        SetupLiveRecord(gcsurl: "c/f", filemetadata: new { nobjects = 1, size = 1 });
        SetupArchiveLookup(snapshot: null);
        var sut = CreateSut();

        var act = () => sut.ResolveDatasetInfoAsync(SdPath, PointInDeletionGap, OperationId, CancellationToken.None);

        _ = (await act.Should().ThrowAsync<RestoreRejectedException>())
            .Which.Message.Should().Contain("no live version");
    }

    [Fact]
    public async Task ResolveDatasetInfoAsync_InvalidRestorePointInTime_ThrowsArgumentException()
    {
        var sut = CreateSut();

        var act = () => sut.ResolveDatasetInfoAsync(SdPath, "not-a-timestamp", OperationId, CancellationToken.None);

        _ = (await act.Should().ThrowAsync<ArgumentException>())
            .And.ParamName.Should().Be("restorePointInTime");
    }

    // ------------------------------------------------------------------------
    // gcsurl / filemetadata extraction edge cases
    // ------------------------------------------------------------------------

    [Fact]
    public async Task ResolveDatasetInfoAsync_MissingGcsurl_Throws()
    {
        // Exercised through the archived-snapshot path (the live window is now a rejection).
        SetupNoLiveRecord();
        SetupArchiveLookup(snapshot: ArchivedSnapshot(gcsurl: null, filemetadata: new { nobjects = 1, size = 1 }));
        var sut = CreateSut();

        var act = () => sut.ResolveDatasetInfoAsync(SdPath, PointInCurrentWindow, OperationId, CancellationToken.None);

        _ = (await act.Should().ThrowAsync<InvalidOperationException>())
            .Which.Message.Should().Contain("missing 'gcsurl'");
    }

    [Fact]
    public async Task ResolveDatasetInfoAsync_NoFilemetadata_ExpectedContentIsNull()
    {
        // filemetadata is absent: the figures are not recorded, so they surface as null (not 0) so
        // downstream consistency validation skips them instead of asserting an empty range.
        SetupNoLiveRecord();
        SetupArchiveLookup(snapshot: ArchivedSnapshot(gcsurl: "c/f", filemetadata: null));
        var sut = CreateSut();

        var result = await sut.ResolveDatasetInfoAsync(SdPath, PointInCurrentWindow, OperationId, CancellationToken.None);

        _ = result.ExpectedObjectCount.Should().BeNull();
        _ = result.ExpectedTotalSize.Should().BeNull();
    }

    [Fact]
    public async Task ResolveDatasetInfoAsync_StringEncodedFilemetadata_IsParsed()
    {
        // filemetadata values can arrive as numeric strings; they must be parsed to numbers.
        SetupNoLiveRecord();
        SetupArchiveLookup(snapshot: ArchivedSnapshot(gcsurl: "c/f", filemetadata: new { nobjects = "12", size = "2048" }));
        var sut = CreateSut();

        var result = await sut.ResolveDatasetInfoAsync(SdPath, PointInCurrentWindow, OperationId, CancellationToken.None);

        _ = result.ExpectedObjectCount.Should().Be(12);
        _ = result.ExpectedTotalSize.Should().Be(2048);
    }

    [Fact]
    public async Task ResolveDatasetInfoAsync_NegativeFilemetadata_IsTreatedAsNotRecorded()
    {
        // Negative counts/sizes are invalid and must be rejected: they surface as null (not
        // recorded), so consistency validation skips them rather than trusting a bogus value.
        SetupNoLiveRecord();
        SetupArchiveLookup(snapshot: ArchivedSnapshot(gcsurl: "c/f", filemetadata: new { nobjects = -1, size = -5 }));
        var sut = CreateSut();

        var result = await sut.ResolveDatasetInfoAsync(SdPath, PointInCurrentWindow, OperationId, CancellationToken.None);

        _ = result.ExpectedObjectCount.Should().BeNull();
        _ = result.ExpectedTotalSize.Should().BeNull();
    }

    // ------------------------------------------------------------------------
    // Constructor guards
    // ------------------------------------------------------------------------

    [Fact]
    public void Constructor_NullLogger_Throws()
    {
        var act = () => new CosmosDatasetStorageInfoProvider(
            null!, _dataAccess.Object, _cosmosClientFactory.Object, _snapshotSelector.Object);
        _ = act.Should().Throw<ArgumentNullException>();
    }

    [Fact]
    public void Constructor_NullDataAccess_Throws()
    {
        var act = () => new CosmosDatasetStorageInfoProvider(
            _logger.Object, null!, _cosmosClientFactory.Object, _snapshotSelector.Object);
        _ = act.Should().Throw<ArgumentNullException>();
    }

    [Fact]
    public void Constructor_NullCosmosClientFactory_Throws()
    {
        var act = () => new CosmosDatasetStorageInfoProvider(
            _logger.Object, _dataAccess.Object, null!, _snapshotSelector.Object);
        _ = act.Should().Throw<ArgumentNullException>();
    }

    [Fact]
    public void Constructor_NullSnapshotSelector_Throws()
    {
        var act = () => new CosmosDatasetStorageInfoProvider(
            _logger.Object, _dataAccess.Object, _cosmosClientFactory.Object, null!);
        _ = act.Should().Throw<ArgumentNullException>();
    }

    // ------------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------------

    /// <summary>Wires the live-record lookup to return a single projected dataset record.</summary>
    private void SetupLiveRecord(string? gcsurl, object? filemetadata)
    {
        var record = new Dictionary<string, object?>
        {
            ["created_date"] = CreatedDate,
            ["last_modified_date"] = VersionStartDate,
        };
        if (gcsurl is not null)
        {
            record["gcsurl"] = gcsurl;
        }
        if (filemetadata is not null)
        {
            record["filemetadata"] = filemetadata;
        }

        var paginated = new PaginatedRecords { records = new List<object> { record } };
        _ = _dataAccess
            .Setup(d => d.GetRecordsAsync(
                It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string?>(),
                It.IsAny<string?>(), It.IsAny<int?>(), It.IsAny<string?>()))
            .ReturnsAsync(paginated);
    }

    /// <summary>Wires the live-record lookup to return no records (deleted dataset).</summary>
    private void SetupNoLiveRecord()
        => _dataAccess
            .Setup(d => d.GetRecordsAsync(
                It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string?>(),
                It.IsAny<string?>(), It.IsAny<int?>(), It.IsAny<string?>()))
            .ReturnsAsync(new PaginatedRecords { records = new List<object>() });

    private void SetupArchiveLookup(ArchivedDatasetMetadata? snapshot)
        => _snapshotSelector
            .Setup(s => s.SelectSnapshotAsync(
                It.IsAny<string>(), It.IsAny<string>(), It.IsAny<long>(),
                It.IsAny<long?>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(snapshot);

    /// <summary>
    /// Builds an archived snapshot whose captured document exposes the same <c>data.gcsurl</c> /
    /// <c>data.filemetadata</c> shape as a live projection. A null gcsurl or filemetadata omits that
    /// node so the extraction edge cases (missing gcsurl, absent/encoded metadata) can be exercised
    /// through the archived-snapshot path.
    /// </summary>
    private static ArchivedDatasetMetadata ArchivedSnapshot(string? gcsurl, object? filemetadata)
    {
        var data = new JObject();
        if (gcsurl is not null)
        {
            data["gcsurl"] = gcsurl;
        }
        if (filemetadata is not null)
        {
            data["filemetadata"] = JToken.FromObject(filemetadata);
        }

        return new ArchivedDatasetMetadata
        {
            Id = "dataset1__1000__2000",
            SdPath = SdPath,
            Document = new JObject { ["data"] = data },
        };
    }
}
