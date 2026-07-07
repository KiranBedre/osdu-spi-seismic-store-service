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

using Constants = Sidecar.Common.Utility.Constants;
using StatusEnum = Sidecar.Common.RestoreOperationStatus;

/// <summary>
/// Comprehensive unit tests for <see cref="RestoreTaskExecutor"/>.
///
/// The executor orchestrates a restore across several collaborators. These tests exercise:
///   - the happy path (new + idempotent re-entry),
///   - terminal-status short-circuiting,
///   - dataset-lock rejection,
///   - SAFE failures (before any mutation) → status Failed, locks released,
///   - POTENTIALLY-INCONSISTENT failures (after a restore id is issued) → status left
///     InProgress, both locks RETAINED for a queue-level retry,
///   - blob restore id persistence / resume,
///   - cancellation, and
///   - sd-path parsing guards.
/// </summary>
public class RestoreTaskExecutorTests
{
    private const string TestTenant = "opendes";
    private const string TestSubproject = "subproj1";
    private const string TestDataset = "datasetX";
    private const string DefaultSdPath = "sd://opendes/subproj1/pathA/datasetX";
    private const string TestOperationId = "op-12345";
    private const string TestCreatedBy = "user@example.com";
    private const string TestCorrelationId = "corr-99";
    private const string TestRestorePoint = "2026-06-01T00:00:00Z";
    private const string TestEndpoint = "https://cosmos.example.com";
    private const string TestRestoreId = "restore-id-1";
    private const string TestETag = "etag-1";

    private readonly Mock<ILogger<RestoreTaskExecutor>> _loggerMock = new();
    private readonly Mock<ILockManager> _lockManagerMock = new();
    private readonly Mock<IRestoreOperationStatusStorage> _statusStorageMock = new();
    private readonly Mock<IDatasetStorageInfoProvider> _storageInfoProviderMock = new();
    private readonly Mock<IMetadataRestoreService> _metadataRestoreServiceMock = new();
    private readonly Mock<IBlobRestoreService> _blobRestoreServiceMock = new();
    private readonly Mock<IContainerRestoreService> _containerRestoreServiceMock = new();
    private readonly Mock<IDataAccess> _dataAccessMock = new();
    private readonly Mock<ICosmosClientFactory> _cosmosClientFactoryMock = new();

    private readonly RestoreTaskExecutor _executor;

    /// <summary>Ordered list of every status string that was created or saved.</summary>
    private readonly List<string> _recordedStatuses = new();

    public RestoreTaskExecutorTests()
    {
        // --- Observability-only dataset existence probe (must not throw) ---
        _ = _cosmosClientFactoryMock
            .Setup(m => m.GetCosmosConnectionEndpointAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(TestEndpoint);
        _ = _dataAccessMock
            .Setup(m => m.GetRecordsAsync(
                It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string?>(),
                It.IsAny<string?>(), It.IsAny<int?>(), It.IsAny<string?>()))
            .ReturnsAsync(new PaginatedRecords { records = null });

        // --- Dataset lock acquired successfully (fresh, non-idempotent) by default ---
        _ = _lockManagerMock
            .Setup(m => m.AcquireWriteLockAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<TimeSpan>()))
            .ReturnsAsync((string key, string wid, TimeSpan _) =>
                new WriteLockSession { Key = key, Wid = wid, Locked = true, IsIdempotent = false });
        _ = _lockManagerMock
            .Setup(m => m.RemoveWriteLockAsync(It.IsAny<WriteLockSession>()))
            .ReturnsAsync(true);

        // --- Status storage: new operation by default, echoing on create/save ---
        _ = _statusStorageMock
            .Setup(m => m.GetRestoreOperationStatusAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((TrackedRestoreStatus?)null);
        _ = _statusStorageMock
            .Setup(m => m.CreateStatusAsync(It.IsAny<string>(), It.IsAny<Common.Model.RestoreOperationStatus>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((string _, Common.Model.RestoreOperationStatus s, CancellationToken _) =>
            {
                _recordedStatuses.Add(s.Status);
                return new TrackedRestoreStatus(s, TestETag);
            });
        _ = _statusStorageMock
            .Setup(m => m.SaveStatusAsync(It.IsAny<string>(), It.IsAny<TrackedRestoreStatus>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((string _, TrackedRestoreStatus t, CancellationToken _) =>
            {
                _recordedStatuses.Add(t.Document.Status);
                return t;
            });

        // --- Storage resolution + happy-path restore collaborators ---
        _ = _storageInfoProviderMock
            .Setup(m => m.ResolveDatasetInfoAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new DatasetStorageInfo(
                GcsUrl: "gs://account/container1",
                ContainerName: "container1",
                VirtualFolder: null,
                BlobPaths: new List<string> { "blob1", "blob2" }));
        _ = _containerRestoreServiceMock
            .Setup(m => m.EnsureContainerAvailableAsync(
                It.IsAny<string>(), It.IsAny<DatasetStorageInfo>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask);
        _ = _blobRestoreServiceMock
            .Setup(m => m.StartBlobRestoreAsync(
                It.IsAny<string>(), It.IsAny<DatasetStorageInfo>(), It.IsAny<string>(),
                It.IsAny<string>(), It.IsAny<string?>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(TestRestoreId);
        _ = _blobRestoreServiceMock
            .Setup(m => m.WaitForBlobRestoreAsync(
                It.IsAny<string>(), It.IsAny<DatasetStorageInfo>(), It.IsAny<string>(),
                It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new BlobRestoreResult { TotalBlobs = 2, RestoredBlobs = 2 });
        _ = _metadataRestoreServiceMock
            .Setup(m => m.FinalizeRestoreAsync(
                It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask);
        _ = _blobRestoreServiceMock
            .Setup(m => m.ValidateConsistencyAsync(
                It.IsAny<string>(), It.IsAny<DatasetStorageInfo>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new ConsistencyValidationResult { IsConsistent = true });

        _executor = new RestoreTaskExecutor(
            _loggerMock.Object,
            _lockManagerMock.Object,
            _statusStorageMock.Object,
            _storageInfoProviderMock.Object,
            _metadataRestoreServiceMock.Object,
            _blobRestoreServiceMock.Object,
            _containerRestoreServiceMock.Object,
            _dataAccessMock.Object,
            _cosmosClientFactoryMock.Object);
    }

    // ------------------------------------------------------------------------
    // Happy path
    // ------------------------------------------------------------------------

    [Fact]
    public async Task ProcessAsync_NewOperation_RunsAllStagesAndSucceeds()
    {
        var message = CreateMessage();

        await _executor.ProcessAsync(message.Object, CancellationToken.None);

        // All stages invoked exactly once, in the expected shape.
        _storageInfoProviderMock.Verify(m => m.ResolveDatasetInfoAsync(DefaultSdPath, TestOperationId, It.IsAny<CancellationToken>()), Times.Once);
        _containerRestoreServiceMock.Verify(m => m.EnsureContainerAvailableAsync(TestTenant, It.IsAny<DatasetStorageInfo>(), TestOperationId, It.IsAny<CancellationToken>()), Times.Once);
        _blobRestoreServiceMock.Verify(m => m.StartBlobRestoreAsync(TestTenant, It.IsAny<DatasetStorageInfo>(), TestRestorePoint, TestOperationId, null, It.IsAny<CancellationToken>()), Times.Once);
        _blobRestoreServiceMock.Verify(m => m.WaitForBlobRestoreAsync(TestTenant, It.IsAny<DatasetStorageInfo>(), TestRestoreId, TestOperationId, It.IsAny<CancellationToken>()), Times.Once);
        _metadataRestoreServiceMock.Verify(m => m.FinalizeRestoreAsync(DefaultSdPath, TestRestorePoint, TestOperationId, It.IsAny<CancellationToken>()), Times.Once);
        _blobRestoreServiceMock.Verify(m => m.ValidateConsistencyAsync(TestTenant, It.IsAny<DatasetStorageInfo>(), TestOperationId, It.IsAny<CancellationToken>()), Times.Once);

        _ = _recordedStatuses.Should().ContainInOrder("InProgress", "Succeeded");
        _ = _recordedStatuses.Last().Should().Be("Succeeded");
    }

    [Fact]
    public async Task ProcessAsync_Success_ReleasesBothLocks()
    {
        var message = CreateMessage();

        await _executor.ProcessAsync(message.Object, CancellationToken.None);

        // Dataset lock + operation lock both released → two RemoveWriteLockAsync calls.
        _lockManagerMock.Verify(m => m.RemoveWriteLockAsync(It.IsAny<WriteLockSession>()), Times.Exactly(2));
        _lockManagerMock.Verify(m => m.RemoveWriteLockAsync(It.Is<WriteLockSession>(s => s.Key == DatasetLockKey())), Times.Once);
        _lockManagerMock.Verify(m => m.RemoveWriteLockAsync(It.Is<WriteLockSession>(s => s.Key == OperationLockKey() && s.Wid == TestOperationId)), Times.Once);
    }

    [Fact]
    public async Task ProcessAsync_AcquiresDatasetLock_WithIdempotentWidFormat()
    {
        var message = CreateMessage();

        await _executor.ProcessAsync(message.Object, CancellationToken.None);

        var expectedWid = $"{Constants.WRITE_LOCK_PREFIX}{TestOperationId}:{DatasetLockKey()}";
        _lockManagerMock.Verify(m => m.AcquireWriteLockAsync(
            DatasetLockKey(),
            expectedWid,
            TimeSpan.FromHours(Constants.RestoreConfiguration.LOCK_TTL_HOURS)), Times.Once);
    }

    [Fact]
    public async Task ProcessAsync_ExistingInProgressStatus_DoesNotRecreateStatus()
    {
        SetupExistingStatus(StatusEnum.InProgress);
        var message = CreateMessage();

        await _executor.ProcessAsync(message.Object, CancellationToken.None);

        _statusStorageMock.Verify(m => m.CreateStatusAsync(It.IsAny<string>(), It.IsAny<Common.Model.RestoreOperationStatus>(), It.IsAny<CancellationToken>()), Times.Never);
        _ = _recordedStatuses.Last().Should().Be("Succeeded");
    }

    // ------------------------------------------------------------------------
    // Terminal-status short-circuit
    // ------------------------------------------------------------------------

    [Theory]
    [InlineData(StatusEnum.Succeeded)]
    [InlineData(StatusEnum.Failed)]
    [InlineData(StatusEnum.Rejected)]
    public async Task ProcessAsync_TerminalStatus_SkipsReExecution(StatusEnum terminal)
    {
        SetupExistingStatus(terminal);
        var message = CreateMessage();

        await _executor.ProcessAsync(message.Object, CancellationToken.None);

        // No restore work performed for an already-terminal operation.
        _storageInfoProviderMock.Verify(m => m.ResolveDatasetInfoAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
        _blobRestoreServiceMock.Verify(m => m.StartBlobRestoreAsync(
            It.IsAny<string>(), It.IsAny<DatasetStorageInfo>(), It.IsAny<string>(),
            It.IsAny<string>(), It.IsAny<string?>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task ProcessAsync_TerminalStatus_StillReleasesLocks()
    {
        SetupExistingStatus(StatusEnum.Succeeded);
        var message = CreateMessage();

        await _executor.ProcessAsync(message.Object, CancellationToken.None);

        _lockManagerMock.Verify(m => m.RemoveWriteLockAsync(It.IsAny<WriteLockSession>()), Times.Exactly(2));
    }

    // ------------------------------------------------------------------------
    // Dataset-lock rejection
    // ------------------------------------------------------------------------

    [Fact]
    public async Task ProcessAsync_DatasetLockHeldByAnotherOperation_MarksRejected()
    {
        _ = _lockManagerMock
            .Setup(m => m.AcquireWriteLockAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<TimeSpan>()))
            .ReturnsAsync(new WriteLockSession { Locked = false });
        var message = CreateMessage();

        await _executor.ProcessAsync(message.Object, CancellationToken.None);

        _ = _recordedStatuses.Should().ContainSingle().Which.Should().Be("Rejected");
        _storageInfoProviderMock.Verify(m => m.ResolveDatasetInfoAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task ProcessAsync_Rejected_ReleasesOnlyOperationLock()
    {
        // The dataset lock session is not owned (Locked=false), so only the operation lock is removed.
        _ = _lockManagerMock
            .Setup(m => m.AcquireWriteLockAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<TimeSpan>()))
            .ReturnsAsync(new WriteLockSession { Locked = false });
        var message = CreateMessage();

        await _executor.ProcessAsync(message.Object, CancellationToken.None);

        _lockManagerMock.Verify(m => m.RemoveWriteLockAsync(It.Is<WriteLockSession>(s => s.Key == OperationLockKey())), Times.Once);
        _lockManagerMock.Verify(m => m.RemoveWriteLockAsync(It.IsAny<WriteLockSession>()), Times.Once);
    }

    // ------------------------------------------------------------------------
    // SAFE failures (before any blob/metadata mutation) → Failed + locks released
    // ------------------------------------------------------------------------

    [Fact]
    public async Task ProcessAsync_ResolveStorageThrows_MarksFailedAndReleasesLocks()
    {
        _ = _storageInfoProviderMock
            .Setup(m => m.ResolveDatasetInfoAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new InvalidOperationException("metadata unavailable"));
        var message = CreateMessage();

        var act = () => _executor.ProcessAsync(message.Object, CancellationToken.None);

        _ = await act.Should().ThrowAsync<InvalidOperationException>();
        _ = _recordedStatuses.Should().Contain("Failed");
        _ = _recordedStatuses.Should().NotContain("Succeeded");
        _lockManagerMock.Verify(m => m.RemoveWriteLockAsync(It.IsAny<WriteLockSession>()), Times.Exactly(2));
    }

    [Fact]
    public async Task ProcessAsync_ContainerUndeleteThrows_MarksFailedAndReleasesLocks()
    {
        _ = _containerRestoreServiceMock
            .Setup(m => m.EnsureContainerAvailableAsync(
                It.IsAny<string>(), It.IsAny<DatasetStorageInfo>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new InvalidOperationException("container undelete failed"));
        var message = CreateMessage();

        var act = () => _executor.ProcessAsync(message.Object, CancellationToken.None);

        _ = await act.Should().ThrowAsync<InvalidOperationException>();
        _ = _recordedStatuses.Should().Contain("Failed");
        _blobRestoreServiceMock.Verify(m => m.StartBlobRestoreAsync(
            It.IsAny<string>(), It.IsAny<DatasetStorageInfo>(), It.IsAny<string>(),
            It.IsAny<string>(), It.IsAny<string?>(), It.IsAny<CancellationToken>()), Times.Never);
        _lockManagerMock.Verify(m => m.RemoveWriteLockAsync(It.IsAny<WriteLockSession>()), Times.Exactly(2));
    }

    [Fact]
    public async Task ProcessAsync_StartBlobRestoreThrows_IsSafeFailure_MarksFailedAndReleasesLocks()
    {
        // A failure before a restore id is issued mutates nothing → SAFE.
        _ = _blobRestoreServiceMock
            .Setup(m => m.StartBlobRestoreAsync(
                It.IsAny<string>(), It.IsAny<DatasetStorageInfo>(), It.IsAny<string>(),
                It.IsAny<string>(), It.IsAny<string?>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new InvalidOperationException("bad restore point"));
        var message = CreateMessage();

        var act = () => _executor.ProcessAsync(message.Object, CancellationToken.None);

        _ = await act.Should().ThrowAsync<InvalidOperationException>();
        _ = _recordedStatuses.Should().Contain("Failed");
        _lockManagerMock.Verify(m => m.RemoveWriteLockAsync(It.IsAny<WriteLockSession>()), Times.Exactly(2));
        _metadataRestoreServiceMock.Verify(m => m.FinalizeRestoreAsync(
            It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    // ------------------------------------------------------------------------
    // POTENTIALLY-INCONSISTENT failures → status stays InProgress, locks RETAINED
    // ------------------------------------------------------------------------

    [Fact]
    public async Task ProcessAsync_WaitForBlobRestoreThrows_RetainsLocksAndKeepsInProgress()
    {
        _ = _blobRestoreServiceMock
            .Setup(m => m.WaitForBlobRestoreAsync(
                It.IsAny<string>(), It.IsAny<DatasetStorageInfo>(), It.IsAny<string>(),
                It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new TimeoutException("restore polling timed out"));
        var message = CreateMessage();

        var act = () => _executor.ProcessAsync(message.Object, CancellationToken.None);

        _ = await act.Should().ThrowAsync<Exception>();
        _lockManagerMock.Verify(m => m.RemoveWriteLockAsync(It.IsAny<WriteLockSession>()), Times.Never);
        _ = _recordedStatuses.Should().NotContain("Failed");
        _ = _recordedStatuses.Should().NotContain("Succeeded");
    }

    [Fact]
    public async Task ProcessAsync_FinalizeMetadataThrows_RetainsLocksAndKeepsInProgress()
    {
        _ = _metadataRestoreServiceMock
            .Setup(m => m.FinalizeRestoreAsync(
                It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new NotImplementedException("metadata backend missing"));
        var message = CreateMessage();

        var act = () => _executor.ProcessAsync(message.Object, CancellationToken.None);

        _ = await act.Should().ThrowAsync<Exception>();
        _lockManagerMock.Verify(m => m.RemoveWriteLockAsync(It.IsAny<WriteLockSession>()), Times.Never);
        _ = _recordedStatuses.Should().NotContain("Failed");
        _ = _recordedStatuses.Should().NotContain("Succeeded");
    }

    [Fact]
    public async Task ProcessAsync_ConsistencyValidationInconsistent_RetainsLocksAndKeepsInProgress()
    {
        _ = _blobRestoreServiceMock
            .Setup(m => m.ValidateConsistencyAsync(
                It.IsAny<string>(), It.IsAny<DatasetStorageInfo>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new ConsistencyValidationResult
            {
                IsConsistent = false,
                MissingBlobs = new List<string> { "blob2" },
                ValidationError = "1 missing blob",
            });
        var message = CreateMessage();

        var act = () => _executor.ProcessAsync(message.Object, CancellationToken.None);

        _ = await act.Should().ThrowAsync<Exception>();
        _lockManagerMock.Verify(m => m.RemoveWriteLockAsync(It.IsAny<WriteLockSession>()), Times.Never);
        _ = _recordedStatuses.Should().NotContain("Succeeded");
    }

    [Fact]
    public async Task ProcessAsync_ConsistencyValidationThrows_RetainsLocksAndKeepsInProgress()
    {
        _ = _blobRestoreServiceMock
            .Setup(m => m.ValidateConsistencyAsync(
                It.IsAny<string>(), It.IsAny<DatasetStorageInfo>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new InvalidOperationException("validation query failed"));
        var message = CreateMessage();

        var act = () => _executor.ProcessAsync(message.Object, CancellationToken.None);

        _ = await act.Should().ThrowAsync<Exception>();
        _lockManagerMock.Verify(m => m.RemoveWriteLockAsync(It.IsAny<WriteLockSession>()), Times.Never);
        _ = _recordedStatuses.Should().NotContain("Succeeded");
    }

    // ------------------------------------------------------------------------
    // Blob restore id persistence / resume
    // ------------------------------------------------------------------------

    [Fact]
    public async Task ProcessAsync_PersistsBlobRestoreId_BeforeWaiting()
    {
        var wOrder = new List<string>();
        _ = _statusStorageMock
            .Setup(m => m.SaveStatusAsync(It.IsAny<string>(), It.Is<TrackedRestoreStatus>(t => t.Document.BlobRestoreId == TestRestoreId), It.IsAny<CancellationToken>()))
            .ReturnsAsync((string _, TrackedRestoreStatus t, CancellationToken _) =>
            {
                wOrder.Add("persisted");
                _recordedStatuses.Add(t.Document.Status);
                return t;
            });
        _ = _blobRestoreServiceMock
            .Setup(m => m.WaitForBlobRestoreAsync(
                It.IsAny<string>(), It.IsAny<DatasetStorageInfo>(), It.IsAny<string>(),
                It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(() =>
            {
                wOrder.Add("waited");
                return new BlobRestoreResult { TotalBlobs = 2, RestoredBlobs = 2 };
            });
        var message = CreateMessage();

        await _executor.ProcessAsync(message.Object, CancellationToken.None);

        _ = wOrder.Should().ContainInOrder("persisted", "waited");
    }

    [Fact]
    public async Task ProcessAsync_ResumeWithExistingRestoreId_PassesItToStartBlobRestore()
    {
        // A redelivered operation already has a persisted BlobRestoreId.
        var existing = new Common.Model.RestoreOperationStatus
        {
            OperationId = TestOperationId,
            SdPath = DefaultSdPath,
            RestorePointInTime = TestRestorePoint,
            Status = "InProgress",
            BlobRestoreId = "prior-restore-id",
        };
        _ = _statusStorageMock
            .Setup(m => m.GetRestoreOperationStatusAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new TrackedRestoreStatus(existing, TestETag));
        _ = _blobRestoreServiceMock
            .Setup(m => m.StartBlobRestoreAsync(
                It.IsAny<string>(), It.IsAny<DatasetStorageInfo>(), It.IsAny<string>(),
                It.IsAny<string>(), It.IsAny<string?>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync("prior-restore-id");
        var message = CreateMessage();

        await _executor.ProcessAsync(message.Object, CancellationToken.None);

        _blobRestoreServiceMock.Verify(m => m.StartBlobRestoreAsync(
            TestTenant, It.IsAny<DatasetStorageInfo>(), TestRestorePoint, TestOperationId, "prior-restore-id", It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task ProcessAsync_NoBlobsToRestore_SkipsRestoreIdPersistenceAndSucceeds()
    {
        // Empty restore id ⇒ nothing to restore.
        _ = _blobRestoreServiceMock
            .Setup(m => m.StartBlobRestoreAsync(
                It.IsAny<string>(), It.IsAny<DatasetStorageInfo>(), It.IsAny<string>(),
                It.IsAny<string>(), It.IsAny<string?>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(string.Empty);
        var message = CreateMessage();

        await _executor.ProcessAsync(message.Object, CancellationToken.None);

        // WaitForBlobRestore is still called (with empty id → immediate completion).
        _blobRestoreServiceMock.Verify(m => m.WaitForBlobRestoreAsync(
            TestTenant, It.IsAny<DatasetStorageInfo>(), string.Empty, TestOperationId, It.IsAny<CancellationToken>()), Times.Once);
        _ = _recordedStatuses.Last().Should().Be("Succeeded");
    }

    // ------------------------------------------------------------------------
    // Cancellation
    // ------------------------------------------------------------------------

    [Fact]
    public async Task ProcessAsync_CancelledDuringBlobWait_PropagatesAndReleasesLocks()
    {
        _ = _blobRestoreServiceMock
            .Setup(m => m.WaitForBlobRestoreAsync(
                It.IsAny<string>(), It.IsAny<DatasetStorageInfo>(), It.IsAny<string>(),
                It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new OperationCanceledException());
        var message = CreateMessage();

        var act = () => _executor.ProcessAsync(message.Object, CancellationToken.None);

        _ = await act.Should().ThrowAsync<OperationCanceledException>();
        // Cancellation is not treated as an inconsistent failure → locks released, status not Failed.
        _lockManagerMock.Verify(m => m.RemoveWriteLockAsync(It.IsAny<WriteLockSession>()), Times.Exactly(2));
        _ = _recordedStatuses.Should().NotContain("Failed");
    }

    // ------------------------------------------------------------------------
    // sd-path parsing guards
    // ------------------------------------------------------------------------

    [Theory]
    [InlineData("")]
    [InlineData("not-a-path")]
    [InlineData("http://opendes/subproj1/datasetX")]
    public async Task ProcessAsync_InvalidSdPathScheme_ThrowsArgumentException(string badPath)
    {
        var message = CreateMessage(sdPath: badPath);

        var act = () => _executor.ProcessAsync(message.Object, CancellationToken.None);

        _ = await act.Should().ThrowAsync<ArgumentException>();
        _lockManagerMock.Verify(m => m.AcquireWriteLockAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<TimeSpan>()), Times.Never);
    }

    [Fact]
    public async Task ProcessAsync_SdPathWithTooFewSegments_ThrowsArgumentException()
    {
        var message = CreateMessage(sdPath: "sd://opendes/subproj1");

        var act = () => _executor.ProcessAsync(message.Object, CancellationToken.None);

        _ = await act.Should().ThrowAsync<ArgumentException>();
    }

    [Fact]
    public async Task ProcessAsync_SdPathWithoutIntermediatePath_UsesRootPathInLockKey()
    {
        var message = CreateMessage(sdPath: "sd://opendes/subproj1/datasetX");

        await _executor.ProcessAsync(message.Object, CancellationToken.None);

        // path collapses to "/" ⇒ lock key is tenant/subproject/dataset
        _lockManagerMock.Verify(m => m.AcquireWriteLockAsync(
            $"{TestTenant}/{TestSubproject}/{TestDataset}", It.IsAny<string>(), It.IsAny<TimeSpan>()), Times.Once);
    }

    // ------------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------------

    private static Mock<IRestoreOperationMessage> CreateMessage(
        string sdPath = DefaultSdPath,
        string operationId = TestOperationId,
        string restorePoint = TestRestorePoint)
    {
        var m = new Mock<IRestoreOperationMessage>();
        _ = m.SetupGet(x => x.OperationId).Returns(operationId);
        _ = m.SetupGet(x => x.SdPath).Returns(sdPath);
        _ = m.SetupGet(x => x.RestorePointInTime).Returns(restorePoint);
        _ = m.SetupGet(x => x.CreatedBy).Returns(TestCreatedBy);
        _ = m.SetupGet(x => x.CorrelationId).Returns(TestCorrelationId);
        return m;
    }

    private void SetupExistingStatus(StatusEnum status)
    {
        var doc = new Common.Model.RestoreOperationStatus
        {
            OperationId = TestOperationId,
            SdPath = DefaultSdPath,
            RestorePointInTime = TestRestorePoint,
            Status = status.ToString(),
        };
        _ = _statusStorageMock
            .Setup(m => m.GetRestoreOperationStatusAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new TrackedRestoreStatus(doc, TestETag));
    }

    private static string DatasetLockKey() => $"{TestTenant}/{TestSubproject}/pathA/{TestDataset}";

    private static string OperationLockKey() => $"restore-op-lock:{TestTenant}";
}
