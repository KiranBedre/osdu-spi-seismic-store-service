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

using Sidecar.Common.Exceptions;
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

    // Restore point is deliberately computed relative to "now" (always ~1 year in the past) rather
    // than a fixed calendar literal. The executor treats the restore point as an opaque pass-through
    // (its collaborators are mocked here), but a hardcoded date would silently drift toward/into the
    // future as the clock advances and could break any future time-window validation; a relative
    // value keeps the test deterministic and evergreen. "s" is the culture-invariant sortable
    // ISO-8601 format, and the trailing "Z" marks it UTC.
    private static readonly string TestRestorePoint =
        DateTimeOffset.UtcNow.AddYears(-1).ToString("s") + "Z";

    private const string TestEndpoint = "https://cosmos.example.com";
    private const string TestRestoreId = "restore-id-1";
    private const string TestETag = "etag-1";
    private const string PriorRestoreId = "prior-restore-id";
    private const int TestBlobCount = 2;
    private const long TestExpectedTotalSize = 2048;
    private const string TestGcsUrl = "gs://account/container1";
    private const string TestContainerName = "container1";
    private const int ForbiddenStatusCode = 403;
    private const string KeyBasedAuthErrorCode = "KeyBasedAuthenticationNotPermitted";
    private const string KeyBasedAuthErrorMessage = "Key based authentication is not permitted.";

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
        _ = _lockManagerMock
            .Setup(m => m.MakeWriteLockIndefiniteAsync(It.IsAny<WriteLockSession>()))
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
            .Setup(m => m.ResolveDatasetInfoAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new DatasetStorageInfo(
                GcsUrl: TestGcsUrl,
                ContainerName: TestContainerName,
                VirtualFolder: null,
                ExpectedObjectCount: TestBlobCount,
                ExpectedTotalSize: TestExpectedTotalSize));
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
                It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new BlobRestoreResult { TotalBlobs = TestBlobCount, RestoredBlobs = TestBlobCount });
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
        _storageInfoProviderMock.Verify(m => m.ResolveDatasetInfoAsync(DefaultSdPath, TestRestorePoint, TestOperationId, It.IsAny<CancellationToken>()), Times.Once);
        _containerRestoreServiceMock.Verify(m => m.EnsureContainerAvailableAsync(TestTenant, It.IsAny<DatasetStorageInfo>(), TestOperationId, It.IsAny<CancellationToken>()), Times.Once);
        _blobRestoreServiceMock.Verify(m => m.StartBlobRestoreAsync(TestTenant, It.IsAny<DatasetStorageInfo>(), TestRestorePoint, TestOperationId, null, It.IsAny<CancellationToken>()), Times.Once);
        _blobRestoreServiceMock.Verify(m => m.WaitForBlobRestoreAsync(TestTenant, It.IsAny<DatasetStorageInfo>(), TestRestoreId, TestRestorePoint, TestOperationId, It.IsAny<CancellationToken>()), Times.Once);
        _metadataRestoreServiceMock.Verify(m => m.FinalizeRestoreAsync(DefaultSdPath, TestRestorePoint, TestOperationId, It.IsAny<CancellationToken>()), Times.Once);
        _blobRestoreServiceMock.Verify(m => m.ValidateConsistencyAsync(TestTenant, It.IsAny<DatasetStorageInfo>(), TestOperationId, It.IsAny<CancellationToken>()), Times.Once);

        _ = _recordedStatuses.Should().ContainInOrder(nameof(StatusEnum.InProgress), nameof(StatusEnum.Succeeded));
        _ = _recordedStatuses.Last().Should().Be(nameof(StatusEnum.Succeeded));
    }

    [Fact]
    public async Task ProcessAsync_Success_ReleasesBothLocks()
    {
        var message = CreateMessage();

        await _executor.ProcessAsync(message.Object, CancellationToken.None);

        // Dataset lock + operation lock both released → two RemoveWriteLockAsync calls.
        _lockManagerMock.Verify(m => m.RemoveWriteLockAsync(It.IsAny<WriteLockSession>()), Times.Exactly(2));
        // On success no lock is made indefinite.
        _lockManagerMock.Verify(m => m.MakeWriteLockIndefiniteAsync(It.IsAny<WriteLockSession>()), Times.Never);
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
        _ = _recordedStatuses.Last().Should().Be(nameof(StatusEnum.Succeeded));
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
        _storageInfoProviderMock.Verify(m => m.ResolveDatasetInfoAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
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

        _ = _recordedStatuses.Should().ContainSingle().Which.Should().Be(nameof(StatusEnum.Rejected));
        _storageInfoProviderMock.Verify(m => m.ResolveDatasetInfoAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
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
            .Setup(m => m.ResolveDatasetInfoAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new InvalidOperationException("metadata unavailable"));
        var message = CreateMessage();

        var act = () => _executor.ProcessAsync(message.Object, CancellationToken.None);

        _ = await act.Should().ThrowAsync<InvalidOperationException>();
        _ = _recordedStatuses.Should().Contain(nameof(StatusEnum.Failed));
        _ = _recordedStatuses.Should().NotContain(nameof(StatusEnum.Succeeded));
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
        _ = _recordedStatuses.Should().Contain(nameof(StatusEnum.Failed));
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
        _ = _recordedStatuses.Should().Contain(nameof(StatusEnum.Failed));
        _lockManagerMock.Verify(m => m.RemoveWriteLockAsync(It.IsAny<WriteLockSession>()), Times.Exactly(2));
        _metadataRestoreServiceMock.Verify(m => m.FinalizeRestoreAsync(
            It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Never);
    }

    [Fact]
    public async Task ProcessAsync_RetryableBlobStartAndStatusSaveFailure_RetainsLocks()
    {
        _ = _blobRestoreServiceMock
            .Setup(m => m.StartBlobRestoreAsync(
                It.IsAny<string>(), It.IsAny<DatasetStorageInfo>(), It.IsAny<string>(),
                It.IsAny<string>(), It.IsAny<string?>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new Common.Exceptions.RetryableRestoreException(
                "PITR was accepted but its restore id is not visible"));
        _ = _statusStorageMock
            .Setup(m => m.SaveStatusAsync(
                It.IsAny<string>(), It.IsAny<TrackedRestoreStatus>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new TimeoutException("Cosmos write timed out"));
        var message = CreateMessage();

        var act = () => _executor.ProcessAsync(message.Object, CancellationToken.None);

        _ = await act.Should().ThrowAsync<Exception>()
            .WithMessage("*could not be started yet*");
        _lockManagerMock.Verify(m => m.RemoveWriteLockAsync(
            It.IsAny<WriteLockSession>()), Times.Never);
        _lockManagerMock.Verify(m => m.MakeWriteLockIndefiniteAsync(
            It.Is<WriteLockSession>(s => s.Key == DatasetLockKey())), Times.Once);
        _lockManagerMock.Verify(m => m.MakeWriteLockIndefiniteAsync(
            It.Is<WriteLockSession>(s => s.Key == OperationLockKey())), Times.Once);
        _ = _recordedStatuses.Should().NotContain(nameof(StatusEnum.Failed));
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
                It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new TimeoutException("restore polling timed out"));
        var message = CreateMessage();

        var act = () => _executor.ProcessAsync(message.Object, CancellationToken.None);

        _ = await act.Should().ThrowAsync<Exception>();
        _lockManagerMock.Verify(m => m.RemoveWriteLockAsync(It.IsAny<WriteLockSession>()), Times.Never);
        _ = _recordedStatuses.Should().NotContain(nameof(StatusEnum.Failed));
        _ = _recordedStatuses.Should().NotContain(nameof(StatusEnum.Succeeded));
    }

    [Fact]
    public async Task ProcessAsync_BlobRestoreFails_RetainsLocksForManualRecovery()
    {
        _ = _blobRestoreServiceMock
            .Setup(m => m.WaitForBlobRestoreAsync(
                It.IsAny<string>(), It.IsAny<DatasetStorageInfo>(), It.IsAny<string>(),
                It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new BlobRestoreFailedException("Azure reported a failed blob restore."));
        var message = CreateMessage();

        var act = () => _executor.ProcessAsync(message.Object, CancellationToken.None);

        _ = await act.Should().NotThrowAsync();
        _lockManagerMock.Verify(m => m.RemoveWriteLockAsync(It.IsAny<WriteLockSession>()), Times.Never);
        _lockManagerMock.Verify(
            m => m.MakeWriteLockIndefiniteAsync(It.Is<WriteLockSession>(s => s.Key == DatasetLockKey())),
            Times.Once);
        _ = _recordedStatuses.Should().Contain(nameof(StatusEnum.Failed));
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
        // Dataset lock is made indefinite (no TTL) so the potentially inconsistent dataset stays
        // fenced off until manual recovery instead of silently expiring.
        _lockManagerMock.Verify(m => m.MakeWriteLockIndefiniteAsync(It.Is<WriteLockSession>(s => s.Key == DatasetLockKey())), Times.Once);
        _ = _recordedStatuses.Should().NotContain(nameof(StatusEnum.Failed));
        _ = _recordedStatuses.Should().NotContain(nameof(StatusEnum.Succeeded));
    }

    [Fact]
    public async Task ProcessAsync_FinalizeMetadataRejects_RetainsLocksForManualRecovery()
    {
        _ = _metadataRestoreServiceMock
            .Setup(m => m.FinalizeRestoreAsync(
                It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new RestoreRejectedException("archived snapshot expired"));
        var message = CreateMessage();

        var act = () => _executor.ProcessAsync(message.Object, CancellationToken.None);

        _ = await act.Should().NotThrowAsync();
        _lockManagerMock.Verify(m => m.RemoveWriteLockAsync(It.IsAny<WriteLockSession>()), Times.Never);
        _lockManagerMock.Verify(
            m => m.MakeWriteLockIndefiniteAsync(It.Is<WriteLockSession>(s => s.Key == DatasetLockKey())),
            Times.Once);
        _ = _recordedStatuses.Should().Contain(nameof(StatusEnum.Failed));
    }

    [Fact]
    public async Task ProcessAsync_FinalizeMetadataNonRetriable_RetainsLocksMarksFailedAndStopsRetry()
    {
        // A permanent, deterministic finalization failure (403 KeyBasedAuthenticationNotPermitted)
        // AFTER blobs were restored: the executor must NOT retry (the message is swallowed so the
        // queue deletes it), but MUST retain both locks and mark the operation terminally Failed.
        _ = _metadataRestoreServiceMock
            .Setup(m => m.FinalizeRestoreAsync(
                It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new Azure.RequestFailedException(
                ForbiddenStatusCode, KeyBasedAuthErrorMessage, KeyBasedAuthErrorCode, null));
        var message = CreateMessage();

        var act = () => _executor.ProcessAsync(message.Object, CancellationToken.None);

        // Non-retriable path is swallowed: no exception propagates (queue deletes the message).
        _ = await act.Should().NotThrowAsync();
        // Locks are retained (dataset stays inaccessible pending manual recovery).
        _lockManagerMock.Verify(m => m.RemoveWriteLockAsync(It.IsAny<WriteLockSession>()), Times.Never);
        // Dataset lock is made indefinite (no TTL) so it does not expire before manual recovery.
        _lockManagerMock.Verify(m => m.MakeWriteLockIndefiniteAsync(It.Is<WriteLockSession>(s => s.Key == DatasetLockKey())), Times.Once);
        // Status is terminal Failed, never Succeeded.
        _ = _recordedStatuses.Should().Contain(nameof(StatusEnum.Failed));
        _ = _recordedStatuses.Should().NotContain(nameof(StatusEnum.Succeeded));
    }

    [Fact]
    public async Task ProcessAsync_FinalizeMetadataCosmosForbidden_TreatedAsNonRetriable()
    {
        // The Cosmos SDK throws CosmosException (NOT RequestFailedException). A deterministic
        // Cosmos 403 during finalize must be classified non-retriable so the executor fails fast
        // (message swallowed, locks retained, terminal Failed) instead of retrying until dead-letter.
        _ = _metadataRestoreServiceMock
            .Setup(m => m.FinalizeRestoreAsync(
                It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new Microsoft.Azure.Cosmos.CosmosException(
                "Request blocked by auth", System.Net.HttpStatusCode.Forbidden, 0, "activity", 1.0));
        var message = CreateMessage();

        var act = () => _executor.ProcessAsync(message.Object, CancellationToken.None);

        // Non-retriable path is swallowed: no exception propagates (queue deletes the message).
        _ = await act.Should().NotThrowAsync();
        // Locks are retained (dataset stays inaccessible pending manual recovery).
        _lockManagerMock.Verify(m => m.RemoveWriteLockAsync(It.IsAny<WriteLockSession>()), Times.Never);
        // Status is terminal Failed, never Succeeded.
        _ = _recordedStatuses.Should().Contain(nameof(StatusEnum.Failed));
        _ = _recordedStatuses.Should().NotContain(nameof(StatusEnum.Succeeded));
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
                ValidationError = "object count mismatch (expected 2, found 1)",
            });
        var message = CreateMessage();

        var act = () => _executor.ProcessAsync(message.Object, CancellationToken.None);

        _ = await act.Should().ThrowAsync<Exception>();
        _lockManagerMock.Verify(m => m.RemoveWriteLockAsync(It.IsAny<WriteLockSession>()), Times.Never);
        _ = _recordedStatuses.Should().NotContain(nameof(StatusEnum.Succeeded));
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
        _ = _recordedStatuses.Should().NotContain(nameof(StatusEnum.Succeeded));
    }

    [Fact]
    public async Task ProcessAsync_ConsistencyValidationNonRetriable_RetainsLocksForManualRecovery()
    {
        _ = _blobRestoreServiceMock
            .Setup(m => m.ValidateConsistencyAsync(
                It.IsAny<string>(), It.IsAny<DatasetStorageInfo>(), It.IsAny<string>(),
                It.IsAny<CancellationToken>()))
            .ThrowsAsync(new Azure.RequestFailedException(
                ForbiddenStatusCode, KeyBasedAuthErrorMessage, KeyBasedAuthErrorCode, null));
        var message = CreateMessage();

        var act = () => _executor.ProcessAsync(message.Object, CancellationToken.None);

        _ = await act.Should().NotThrowAsync();
        _lockManagerMock.Verify(m => m.RemoveWriteLockAsync(It.IsAny<WriteLockSession>()), Times.Never);
        _lockManagerMock.Verify(
            m => m.MakeWriteLockIndefiniteAsync(It.Is<WriteLockSession>(s => s.Key == DatasetLockKey())),
            Times.Once);
        _ = _recordedStatuses.Should().Contain(nameof(StatusEnum.Failed));
    }

    // ------------------------------------------------------------------------
    // A status-write failure INSIDE a post-mutation handler must not
    // downgrade the retain-locks classification into the release-locks generic catch.
    // ------------------------------------------------------------------------

    [Fact]
    public async Task ProcessAsync_TransientFinalizeAndStatusSaveAlsoFails_StillRetainsLocks()
    {
        // Post-blob-restore, transient finalize failure whose retain-locks handler ALSO fails to
        // persist status. Without best-effort persistence the SaveStatusAsync exception would replace
        // the RestoreRetryableException and fall into the generic catch, RELEASING the locks on a
        // potentially inconsistent dataset. The locks must stay held.
        SetupResumeStatusWithBlobRestoreId();
        _ = _metadataRestoreServiceMock
            .Setup(m => m.FinalizeRestoreAsync(
                It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new TimeoutException("finalize timed out"));
        _ = _statusStorageMock
            .Setup(m => m.SaveStatusAsync(It.IsAny<string>(), It.IsAny<TrackedRestoreStatus>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new Microsoft.Azure.Cosmos.CosmosException(
                "etag conflict", System.Net.HttpStatusCode.PreconditionFailed, 0, "activity", 1.0));
        var message = CreateMessage();

        var act = () => _executor.ProcessAsync(message.Object, CancellationToken.None);

        // Retryable path rethrows for queue-level retry.
        _ = await act.Should().ThrowAsync<Exception>();
        // Critical: locks retained despite the failed status write (no release).
        _lockManagerMock.Verify(m => m.RemoveWriteLockAsync(It.IsAny<WriteLockSession>()), Times.Never);
    }

    [Fact]
    public async Task ProcessAsync_NonRetriableFinalizeAndStatusSaveAlsoFails_StillRetainsLocksAndStopsRetry()
    {
        // Post-blob-restore, non-retriable finalize failure (Cosmos 403) whose manual-recovery
        // handler ALSO fails to persist status. The best-effort save must swallow that failure so the
        // RestoreManualRecoveryException still governs: message swallowed (no retry) and both locks
        // retained. Without it, the SaveStatusAsync exception would hit the generic catch and RELEASE
        // the locks on a potentially inconsistent dataset.
        SetupResumeStatusWithBlobRestoreId();
        _ = _metadataRestoreServiceMock
            .Setup(m => m.FinalizeRestoreAsync(
                It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new Microsoft.Azure.Cosmos.CosmosException(
                "Request blocked by auth", System.Net.HttpStatusCode.Forbidden, 0, "activity", 1.0));
        _ = _statusStorageMock
            .Setup(m => m.SaveStatusAsync(It.IsAny<string>(), It.IsAny<TrackedRestoreStatus>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new Microsoft.Azure.Cosmos.CosmosException(
                "etag conflict", System.Net.HttpStatusCode.PreconditionFailed, 0, "activity", 1.0));
        var message = CreateMessage();

        var act = () => _executor.ProcessAsync(message.Object, CancellationToken.None);

        // Non-retriable path is swallowed: no exception propagates (queue deletes the message).
        _ = await act.Should().NotThrowAsync();
        // Critical: locks retained despite the failed status write.
        _lockManagerMock.Verify(m => m.RemoveWriteLockAsync(It.IsAny<WriteLockSession>()), Times.Never);
    }

    // ------------------------------------------------------------------------
    // The terminal "mark Succeeded" write must not turn a fully-successful,
    // consistent restore into a Failed result. A transient write failure there is
    // classified as retryable (retain locks + queue redelivery) rather than falling
    // into the generic catch that would mark Failed and release the locks.
    // ------------------------------------------------------------------------

    [Fact]
    public async Task ProcessAsync_SucceededStatusSaveFailsTransiently_RetainsLocksForRetry()
    {
        // Full happy path (blobs restored, metadata finalized, consistency validated); only the
        // final Succeeded write fails transiently (Cosmos 503). It must be retried at the queue
        // level with locks held, NOT reported as a hard Failed with locks released.
        _ = _statusStorageMock
            .Setup(m => m.SaveStatusAsync(
                It.IsAny<string>(),
                It.Is<TrackedRestoreStatus>(t => t.Document.Status == nameof(StatusEnum.Succeeded)),
                It.IsAny<CancellationToken>()))
            .ThrowsAsync(new Microsoft.Azure.Cosmos.CosmosException(
                "service unavailable", System.Net.HttpStatusCode.ServiceUnavailable, 0, "activity", 1.0));
        var message = CreateMessage();

        var act = () => _executor.ProcessAsync(message.Object, CancellationToken.None);

        // Retryable path rethrows for queue-level retry.
        _ = await act.Should().ThrowAsync<Exception>();
        // Critical: locks retained (no release) so redelivery can resume idempotently.
        _lockManagerMock.Verify(m => m.RemoveWriteLockAsync(It.IsAny<WriteLockSession>()), Times.Never);
    }

    [Fact]
    public async Task ProcessAsync_SucceededStatusSaveFailsTransiently_DoesNotMarkFailed()
    {
        // A successful, consistent restore whose terminal write blipped must never be recorded as
        // Failed — that would surface a false failure to the caller for a dataset that is actually
        // restored. The generic catch (which marks Failed) must not run.
        _ = _statusStorageMock
            .Setup(m => m.SaveStatusAsync(
                It.IsAny<string>(),
                It.Is<TrackedRestoreStatus>(t => t.Document.Status == nameof(StatusEnum.Succeeded)),
                It.IsAny<CancellationToken>()))
            .ThrowsAsync(new Microsoft.Azure.Cosmos.CosmosException(
                "service unavailable", System.Net.HttpStatusCode.ServiceUnavailable, 0, "activity", 1.0));
        var message = CreateMessage();

        var act = () => _executor.ProcessAsync(message.Object, CancellationToken.None);

        _ = await act.Should().ThrowAsync<Exception>();
        _ = _recordedStatuses.Should().NotContain(nameof(StatusEnum.Failed));
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
                It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(() =>
            {
                wOrder.Add("waited");
                return new BlobRestoreResult { TotalBlobs = TestBlobCount, RestoredBlobs = TestBlobCount };
            });
        var message = CreateMessage();

        await _executor.ProcessAsync(message.Object, CancellationToken.None);

        _ = wOrder.Should().ContainInOrder("persisted", "waited");
    }

    [Fact]
    public async Task ProcessAsync_BlobRestoreIdSaveFails_RetainsLocksForRetry()
    {
        _ = _statusStorageMock
            .Setup(m => m.SaveStatusAsync(
                It.IsAny<string>(),
                It.Is<TrackedRestoreStatus>(t => t.Document.BlobRestoreId == TestRestoreId),
                It.IsAny<CancellationToken>()))
            .ThrowsAsync(new TimeoutException("Cosmos write timed out"));
        var message = CreateMessage();

        var act = () => _executor.ProcessAsync(message.Object, CancellationToken.None);

        _ = await act.Should().ThrowAsync<Exception>();
        _lockManagerMock.Verify(m => m.RemoveWriteLockAsync(It.IsAny<WriteLockSession>()), Times.Never);
        _lockManagerMock.Verify(
            m => m.MakeWriteLockIndefiniteAsync(It.Is<WriteLockSession>(s => s.Key == DatasetLockKey())),
            Times.Once);
        _ = _recordedStatuses.Should().NotContain(nameof(StatusEnum.Failed));
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
            Status = nameof(StatusEnum.InProgress),
            BlobRestoreId = PriorRestoreId,
        };
        _ = _statusStorageMock
            .Setup(m => m.GetRestoreOperationStatusAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new TrackedRestoreStatus(existing, TestETag));
        _ = _blobRestoreServiceMock
            .Setup(m => m.StartBlobRestoreAsync(
                It.IsAny<string>(), It.IsAny<DatasetStorageInfo>(), It.IsAny<string>(),
                It.IsAny<string>(), It.IsAny<string?>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(PriorRestoreId);
        var message = CreateMessage();

        await _executor.ProcessAsync(message.Object, CancellationToken.None);

        _blobRestoreServiceMock.Verify(m => m.StartBlobRestoreAsync(
            TestTenant, It.IsAny<DatasetStorageInfo>(), TestRestorePoint, TestOperationId, PriorRestoreId, It.IsAny<CancellationToken>()), Times.Once);
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
            TestTenant, It.IsAny<DatasetStorageInfo>(), string.Empty, TestRestorePoint, TestOperationId, It.IsAny<CancellationToken>()), Times.Once);
        _ = _recordedStatuses.Last().Should().Be(nameof(StatusEnum.Succeeded));
    }

    // ------------------------------------------------------------------------
    // Cancellation
    // ------------------------------------------------------------------------

    [Fact]
    public async Task ProcessAsync_CancelledBeforeBlobRestore_PropagatesAndReleasesLocks()
    {
        _ = _storageInfoProviderMock
            .Setup(m => m.ResolveDatasetInfoAsync(
                It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(),
                It.IsAny<CancellationToken>()))
            .ThrowsAsync(new OperationCanceledException());
        var message = CreateMessage();

        var act = () => _executor.ProcessAsync(message.Object, CancellationToken.None);

        _ = await act.Should().ThrowAsync<OperationCanceledException>();
        _lockManagerMock.Verify(m => m.RemoveWriteLockAsync(
            It.IsAny<WriteLockSession>()), Times.Exactly(2));
        _lockManagerMock.Verify(m => m.MakeWriteLockIndefiniteAsync(
            It.IsAny<WriteLockSession>()), Times.Never);
    }

    [Fact]
    public async Task ProcessAsync_CancelledDuringBlobWait_PropagatesAndRetainsLocks()
    {
        _ = _blobRestoreServiceMock
            .Setup(m => m.WaitForBlobRestoreAsync(
                It.IsAny<string>(), It.IsAny<DatasetStorageInfo>(), It.IsAny<string>(),
                It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new OperationCanceledException());
        var message = CreateMessage();

        var act = () => _executor.ProcessAsync(message.Object, CancellationToken.None);

        _ = await act.Should().ThrowAsync<OperationCanceledException>();
        _lockManagerMock.Verify(m => m.RemoveWriteLockAsync(
            It.IsAny<WriteLockSession>()), Times.Never);
        _lockManagerMock.Verify(m => m.MakeWriteLockIndefiniteAsync(
            It.Is<WriteLockSession>(s => s.Key == DatasetLockKey())), Times.Once);
        _lockManagerMock.Verify(m => m.MakeWriteLockIndefiniteAsync(
            It.Is<WriteLockSession>(s =>
                s.Key == OperationLockKey() && s.Wid == TestOperationId)), Times.Once);
        _ = _recordedStatuses.Should().NotContain(nameof(StatusEnum.Failed));
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
    // End-to-end: raw queue payload → deserializer → executor
    // ------------------------------------------------------------------------

    [Fact]
    public async Task RawQueueMessage_DeserializedAndProcessed_RunsAllStagesAndSucceeds()
    {
        // Start from the actual JSON payload that lands on the restore queue and run it through the
        // real deserializer (the production request-message seam) before handing it to the executor,
        // so the whole path — deserialize → orchestrate → succeed — is exercised end to end.
        // Built from the shared constants (including the relative TestRestorePoint) so the wire
        // payload can never drift out of sync with the values the assertions below expect.
        var rawTask =
            $"{{\"operation_id\":\"{TestOperationId}\",\"createdBy\":\"{TestCreatedBy}\"," +
            $"\"sdPath\":\"{DefaultSdPath}\",\"restorePointInTime\":\"{TestRestorePoint}\"," +
            $"\"correlationId\":\"{TestCorrelationId}\"}}";

        var message = new Sidecar.Common.TaskQueue.RestoreJsonDeserializer().Deserialize(rawTask);

        await _executor.ProcessAsync(message, CancellationToken.None);

        // Deserialized fields flowed unchanged into every downstream stage.
        _storageInfoProviderMock.Verify(m => m.ResolveDatasetInfoAsync(DefaultSdPath, TestRestorePoint, TestOperationId, It.IsAny<CancellationToken>()), Times.Once);
        _containerRestoreServiceMock.Verify(m => m.EnsureContainerAvailableAsync(TestTenant, It.IsAny<DatasetStorageInfo>(), TestOperationId, It.IsAny<CancellationToken>()), Times.Once);
        _blobRestoreServiceMock.Verify(m => m.StartBlobRestoreAsync(TestTenant, It.IsAny<DatasetStorageInfo>(), TestRestorePoint, TestOperationId, null, It.IsAny<CancellationToken>()), Times.Once);
        _blobRestoreServiceMock.Verify(m => m.WaitForBlobRestoreAsync(TestTenant, It.IsAny<DatasetStorageInfo>(), TestRestoreId, TestRestorePoint, TestOperationId, It.IsAny<CancellationToken>()), Times.Once);
        _metadataRestoreServiceMock.Verify(m => m.FinalizeRestoreAsync(DefaultSdPath, TestRestorePoint, TestOperationId, It.IsAny<CancellationToken>()), Times.Once);
        _blobRestoreServiceMock.Verify(m => m.ValidateConsistencyAsync(TestTenant, It.IsAny<DatasetStorageInfo>(), TestOperationId, It.IsAny<CancellationToken>()), Times.Once);

        _ = _recordedStatuses.Should().ContainInOrder(nameof(StatusEnum.InProgress), nameof(StatusEnum.Succeeded));
        _ = _recordedStatuses.Last().Should().Be(nameof(StatusEnum.Succeeded));

        // Both locks released on success.
        _lockManagerMock.Verify(m => m.RemoveWriteLockAsync(It.IsAny<WriteLockSession>()), Times.Exactly(2));
    }

    // ------------------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------------------

    private static Mock<IRestoreOperationMessage> CreateMessage(
        string sdPath = DefaultSdPath,
        string operationId = TestOperationId,
        string? restorePoint = null)
    {
        var m = new Mock<IRestoreOperationMessage>();
        _ = m.SetupGet(x => x.OperationId).Returns(operationId);
        _ = m.SetupGet(x => x.SdPath).Returns(sdPath);
        _ = m.SetupGet(x => x.RestorePointInTime).Returns(restorePoint ?? TestRestorePoint);
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

    /// <summary>
    /// Sets up a redelivered, in-progress operation whose BlobRestoreId already matches the default
    /// StartBlobRestore return, so the pre-finalize "persist restore id" save is skipped and the
    /// first (and only) SaveStatusAsync invocation is the one INSIDE the finalize failure handler.
    /// This isolates the post-mutation status-persistence behaviour under test.
    /// </summary>
    private void SetupResumeStatusWithBlobRestoreId()
    {
        var doc = new Common.Model.RestoreOperationStatus
        {
            OperationId = TestOperationId,
            SdPath = DefaultSdPath,
            RestorePointInTime = TestRestorePoint,
            Status = nameof(StatusEnum.InProgress),
            BlobRestoreId = TestRestoreId,
        };
        _ = _statusStorageMock
            .Setup(m => m.GetRestoreOperationStatusAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(new TrackedRestoreStatus(doc, TestETag));
    }

    private static string DatasetLockKey() => $"{TestTenant}/{TestSubproject}/pathA/{TestDataset}";

    private static string OperationLockKey() => $"restore-op-lock:{TestTenant}";
}
