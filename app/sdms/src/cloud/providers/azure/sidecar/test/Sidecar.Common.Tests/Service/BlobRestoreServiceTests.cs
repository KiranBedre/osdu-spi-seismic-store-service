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

using System.Net;
using System.Text;
using Azure;
using Azure.Core;
using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;
using Sidecar.Common.Utility;

/// <summary>
/// Unit tests for <see cref="BlobRestoreService"/> — the component that actually issues the
/// Azure Storage management-plane Point-in-Time Restore (PITR) request
/// (<c>POST .../storageAccounts/{account}/restoreBlobRanges</c>) and reads account
/// <c>blobRestoreStatus</c>.
///
/// The management-plane HTTP round-trip is the only non-deterministic dependency, so it is
/// replaced with a <see cref="StubHttpMessageHandler"/>. This lets every PITR branch be driven
/// deterministically without touching Azure:
///   - request construction (URI, api-version, bearer token, blob-range body),
///   - restore id parsing + account-status fallback,
///   - 409 Conflict adoption of an in-flight restore,
///   - resume/idempotency against an existing restore id,
///   - error propagation.
///
/// Long polling paths (<see cref="BlobRestoreService.WaitForBlobRestoreAsync"/> against a running
/// restore) are covered only via their immediate-return fast paths so the suite stays fast.
/// </summary>
public class BlobRestoreServiceTests
{
    private const string DataPartition = "opendes";
    private const string SubscriptionId = "sub-123";
    private const string ResourceGroup = "rg-1";
    private const string StorageAccount = "storageacct";
    private const string OperationId = "op-1";
    private const string RestorePoint = "2026-06-01T00:00:00Z";
    private const string BearerToken = "faketoken";

    // Realistic dataset UUID + gcsurl layouts for each access policy:
    //   Uniform: "<shared-container>/<uuid>"            → ss-local-psmb3nw5vxy8n52/64cc33b9-...
    //   Dataset: "<container-with-uuid-appended>" (none) → ss-local-psmb3nw5vxy8n52-64cc33b9-...
    private const string DatasetUuid = "64cc33b9-e313-4453-994f-400bda80ef96";
    private const string UniformPolicyContainer = "ss-local-psmb3nw5vxy8n52";
    private const string DatasetPolicyContainer = "ss-local-psmb3nw5vxy8n52-64cc33b9-e313-4453-994f-400bda80ef96";

    private const string DefaultContainer = "container1";
    private const long DefaultExpectedObjectCount = 2;
    private const long DefaultExpectedTotalSize = 2048;

    private readonly Mock<ILogger<BlobRestoreService>> _logger = new();
    private readonly Mock<IBlobClientFactory> _blobClientFactory = new();
    private readonly Mock<IAzureStorageResourceResolver> _resolver = new();
    private readonly Mock<TokenCredential> _credential = new();
    private readonly StubHttpMessageHandler _handler = new();

    public BlobRestoreServiceTests()
    {
        _ = _resolver.SetupGet(r => r.SubscriptionId).Returns(SubscriptionId);
        _ = _resolver.Setup(r => r.ResolveResourceGroupName(It.IsAny<string>())).Returns(ResourceGroup);
        _ = _resolver
            .Setup(r => r.ResolveStorageAccountNameAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(StorageAccount);
        _ = _credential
            .Setup(c => c.GetTokenAsync(It.IsAny<TokenRequestContext>(), It.IsAny<CancellationToken>()))
            .Returns(new ValueTask<AccessToken>(new AccessToken(BearerToken, DateTimeOffset.UtcNow.AddHours(1))));
    }

    private BlobRestoreService CreateSut()
        => new(_logger.Object, _blobClientFactory.Object, _resolver.Object, new HttpClient(_handler), _credential.Object);

    // gcsurl is stored as "<container>/<virtualFolder>" for uniform-access datasets and just
    // "<container>" for dataset-access datasets (no scheme prefix), e.g.
    //   ss-local-psmb3nw5vxy8n52/64cc33b9-e313-4453-994f-400bda80ef96
    private static DatasetStorageInfo StorageInfo(
        string container = DefaultContainer,
        string? virtualFolder = null,
        long? expectedObjectCount = DefaultExpectedObjectCount,
        long? expectedTotalSize = DefaultExpectedTotalSize)
        => new(
            GcsUrl: string.IsNullOrWhiteSpace(virtualFolder) ? container : $"{container}/{virtualFolder.Trim('/')}",
            ContainerName: container,
            VirtualFolder: virtualFolder,
            ExpectedObjectCount: expectedObjectCount,
            ExpectedTotalSize: expectedTotalSize);

    private static string AccountStatusJson(
        string? restoreId,
        string? status,
        string? timeToRestore = null,
        (string StartRange, string EndRange)? blobRange = null)
    {
        var inner = new List<string>();
        if (restoreId is not null)
        {
            inner.Add($"\"restoreId\":\"{restoreId}\"");
        }
        if (status is not null)
        {
            inner.Add($"\"status\":\"{status}\"");
        }
        var parameters = new List<string>();
        if (timeToRestore is not null)
        {
            parameters.Add($"\"timeToRestore\":\"{timeToRestore}\"");
        }
        if (blobRange is not null)
        {
            parameters.Add(
                $"\"blobRanges\":[{{\"startRange\":\"{blobRange.Value.StartRange}\"," +
                $"\"endRange\":\"{blobRange.Value.EndRange}\"}}]");
        }
        if (parameters.Count > 0)
        {
            inner.Add($"\"parameters\":{{{string.Join(",", parameters)}}}");
        }
        return $"{{\"properties\":{{\"blobRestoreStatus\":{{{string.Join(",", inner)}}}}}}}";
    }

    // ------------------------------------------------------------------------
    // StartBlobRestoreAsync — revert-to-empty still submits
    // ------------------------------------------------------------------------

    [Fact]
    public async Task StartBlobRestoreAsync_ZeroExpectedCount_StillSubmitsPitr()
    {
        // A revert-to-empty restore (the target version had 0 blobs) must STILL submit a PITR so any
        // blobs created AFTER the restore point are removed. ExpectedObjectCount is the restore-TARGET
        // version's count, not a measure of work to do, so it must not short-circuit the submit.
        _handler.EnqueueJson(HttpStatusCode.OK, AccountStatusJson(null, null));
        _handler.EnqueueJson(HttpStatusCode.Accepted, "{\"restoreId\":\"restore-empty\"}");
        var sut = CreateSut();
        var storage = new DatasetStorageInfo(DefaultContainer, DefaultContainer, null, 0, 0);

        var result = await sut.StartBlobRestoreAsync(
            DataPartition, storage, RestorePoint, OperationId, existingRestoreId: null, CancellationToken.None);

        _ = result.Should().Be("restore-empty");
        _ = _handler.Requests.Should().HaveCount(2);
        _ = _handler.Requests[0].Method.Should().Be(HttpMethod.Get);
        _ = _handler.Requests[1].Method.Should().Be(HttpMethod.Post);
    }

    // ------------------------------------------------------------------------
    // StartBlobRestoreAsync — fresh submit (the core PITR request)
    // ------------------------------------------------------------------------

    [Fact]
    public async Task StartBlobRestoreAsync_Success_SubmitsPitrRequest_AndReturnsRestoreId()
    {
        // A1 reconcile-before-submit: a fresh start first GETs account status (nothing to adopt
        // here), then POSTs the PITR request.
        _handler.EnqueueJson(HttpStatusCode.OK, AccountStatusJson(null, null));
        _handler.EnqueueJson(HttpStatusCode.Accepted, "{\"restoreId\":\"restore-abc\"}");
        var sut = CreateSut();

        var result = await sut.StartBlobRestoreAsync(
            DataPartition, StorageInfo(), RestorePoint, OperationId, existingRestoreId: null, CancellationToken.None);

        _ = result.Should().Be("restore-abc");

        _ = _handler.Requests.Should().HaveCount(2);
        _ = _handler.Requests[0].Method.Should().Be(HttpMethod.Get);
        var req = _handler.Requests[1];
        _ = req.Method.Should().Be(HttpMethod.Post);
        _ = req.Uri.ToString().Should().Contain(
            $"subscriptions/{SubscriptionId}/resourceGroups/{ResourceGroup}" +
            $"/providers/Microsoft.Storage/storageAccounts/{StorageAccount}/restoreBlobRanges");
        _ = req.Uri.ToString().Should().Contain($"api-version={Constants.RestoreConfiguration.STORAGE_MANAGEMENT_API_VERSION}");
        _ = req.Authorization!.Scheme.Should().Be("Bearer");
        _ = req.Authorization.Parameter.Should().Be(BearerToken);
    }

    [Fact]
    public async Task StartBlobRestoreAsync_DatasetPolicy_ScopesRangeToDedicatedContainer()
    {
        // Dataset access policy: the dataset gets its OWN container whose name embeds the dataset
        // UUID (hyphen-joined), and there is NO virtual folder. gcsurl example:
        //   ss-local-psmb3nw5vxy8n52-64cc33b9-e313-4453-994f-400bda80ef96
        //
        // Azure rejects "<container>/" because the blob-name part is empty. A space is the
        // lexicographically lowest valid Azure blob-name character, so the half-open range
        // ["c/ ", "c0") covers the dedicated container without spilling into siblings.
        _handler.EnqueueJson(HttpStatusCode.OK, AccountStatusJson(null, null));
        _handler.EnqueueJson(HttpStatusCode.Accepted, "{\"restoreId\":\"restore-abc\"}");
        var sut = CreateSut();

        _ = await sut.StartBlobRestoreAsync(
            DataPartition, StorageInfo(container: DatasetPolicyContainer, virtualFolder: null),
            RestorePoint, OperationId, null, CancellationToken.None);

        var body = _handler.Requests[1].Body!;
        _ = body.Should().Contain("\"timeToRestore\":");
        _ = body.Should().Contain($"\"startRange\":\"{DatasetPolicyContainer}/ \"");
        _ = body.Should().Contain($"\"endRange\":\"{DatasetPolicyContainer}0\"");
    }

    [Fact]
    public async Task StartBlobRestoreAsync_UniformPolicy_ScopesRangeToVirtualFolderPrefix()
    {
        // Uniform access policy: datasets SHARE a container and are separated by a virtual folder
        // (the dataset UUID). gcsurl example:
        //   ss-local-psmb3nw5vxy8n52/64cc33b9-e313-4453-994f-400bda80ef96
        //
        // Replacing the trailing '/' with the next character '0' creates a prefix-complete,
        // Unicode-safe half-open range without spilling into sibling folders.
        _handler.EnqueueJson(HttpStatusCode.OK, AccountStatusJson(null, null));
        _handler.EnqueueJson(HttpStatusCode.Accepted, "{\"restoreId\":\"restore-abc\"}");
        var sut = CreateSut();

        _ = await sut.StartBlobRestoreAsync(
            DataPartition,
            StorageInfo(container: UniformPolicyContainer, virtualFolder: DatasetUuid),
            RestorePoint, OperationId, null, CancellationToken.None);

        var body = _handler.Requests[1].Body!;
        _ = body.Should().Contain($"\"startRange\":\"{UniformPolicyContainer}/{DatasetUuid}/\"");
        _ = body.Should().Contain($"\"endRange\":\"{UniformPolicyContainer}/{DatasetUuid}0\"");
    }

    [Fact]
    public async Task StartBlobRestoreAsync_ResponseOmitsId_RecoversIdFromAccountStatus()
    {
        // Reconcile GET (nothing to adopt), then POST accepted but body carries no restoreId, then
        // the omitted-id recovery GET supplies it.
        _handler.EnqueueJson(HttpStatusCode.OK, AccountStatusJson(null, null));
        _handler.EnqueueJson(HttpStatusCode.OK, string.Empty);
        _handler.EnqueueJson(HttpStatusCode.OK, AccountStatusJson("recovered-id", "InProgress"));
        var sut = CreateSut();

        var result = await sut.StartBlobRestoreAsync(
            DataPartition, StorageInfo(), RestorePoint, OperationId, null, CancellationToken.None);

        _ = result.Should().Be("recovered-id");
        _ = _handler.Requests.Should().HaveCount(3);
        _ = _handler.Requests[0].Method.Should().Be(HttpMethod.Get);
        _ = _handler.Requests[1].Method.Should().Be(HttpMethod.Post);
        _ = _handler.Requests[2].Method.Should().Be(HttpMethod.Get);
    }

    [Fact]
    public async Task StartBlobRestoreAsync_Conflict_AdoptsInFlightRestore()
    {
        // Reconcile GET finds nothing to adopt yet, the POST races into a 409, and the follow-up
        // account GET reports an in-flight restore whose timeToRestore matches our target — adopt it.
        _handler.EnqueueJson(HttpStatusCode.OK, AccountStatusJson(null, null));
        _handler.EnqueueJson(HttpStatusCode.Conflict, string.Empty);
        _handler.EnqueueJson(HttpStatusCode.OK, AccountStatusJson(
            "inflight-id", "InProgress", RestorePoint,
            ($"{DefaultContainer}/ ", $"{DefaultContainer}0")));
        var sut = CreateSut();

        var result = await sut.StartBlobRestoreAsync(
            DataPartition, StorageInfo(), RestorePoint, OperationId, null, CancellationToken.None);

        _ = result.Should().Be("inflight-id");
    }

    [Fact]
    public async Task StartBlobRestoreAsync_Conflict_NoAdoptableRestore_ThrowsRetryable()
    {
        // 409 Conflict, but the account status reports no restoreId to adopt. This is a transient
        // condition (only one blob-range restore per account at a time), so it must surface as a
        // retryable exception rather than a permanent failure.
        _handler.EnqueueJson(HttpStatusCode.OK, AccountStatusJson(null, null));
        _handler.EnqueueJson(HttpStatusCode.Conflict, string.Empty);
        _handler.EnqueueJson(HttpStatusCode.OK, AccountStatusJson(null, "InProgress"));
        var sut = CreateSut();

        var act = async () => await sut.StartBlobRestoreAsync(
            DataPartition, StorageInfo(), RestorePoint, OperationId, null, CancellationToken.None);

        _ = await act.Should().ThrowAsync<Sidecar.Common.Exceptions.RetryableRestoreException>()
            .WithMessage("*409*");
    }

    [Fact]
    public async Task StartBlobRestoreAsync_Reconcile_AccountRestoreMatchesTarget_AdoptsWithoutSubmitting()
    {
        // Crash-before-persist window: no restoreId was ever persisted, but the account
        // already carries a restore whose parameters.timeToRestore matches our target point-in-time.
        // Because Azure serializes one blob-range restore per account, that restore is ours \u2014 adopt
        // it instead of resubmitting a duplicate (potentially multi-hour) restore. Only the reconcile
        // GET should be issued; no POST.
        _handler.EnqueueJson(HttpStatusCode.OK, AccountStatusJson(
            "adopted-id", "InProgress", RestorePoint,
            ($"{DefaultContainer}/ ", $"{DefaultContainer}0")));
        var sut = CreateSut();

        var result = await sut.StartBlobRestoreAsync(
            DataPartition, StorageInfo(), RestorePoint, OperationId, existingRestoreId: null, CancellationToken.None);

        _ = result.Should().Be("adopted-id");
        _ = _handler.Requests.Should().ContainSingle();
        _ = _handler.Requests[0].Method.Should().Be(HttpMethod.Get);
    }

    [Fact]
    public async Task StartBlobRestoreAsync_Reconcile_SameTargetDifferentRange_SubmitsNewRestore()
    {
        _handler.EnqueueJson(HttpStatusCode.OK, AccountStatusJson(
            "other-id", "InProgress", RestorePoint, ("other-container/", "other-container0")));
        _handler.EnqueueJson(HttpStatusCode.Accepted, "{\"restoreId\":\"restore-new\"}");
        var sut = CreateSut();

        var result = await sut.StartBlobRestoreAsync(
            DataPartition, StorageInfo(), RestorePoint, OperationId,
            existingRestoreId: null, CancellationToken.None);

        _ = result.Should().Be("restore-new");
        _ = _handler.Requests.Should().HaveCount(2);
        _ = _handler.Requests[1].Method.Should().Be(HttpMethod.Post);
    }

    [Fact]
    public async Task StartBlobRestoreAsync_Reconcile_AccountRestoreDifferentTarget_SubmitsNewRestore()
    {
        // The account carries a restore for a DIFFERENT point-in-time (timeToRestore mismatch), so it
        // is not ours to adopt \u2014 proceed to submit a fresh PITR request.
        _handler.EnqueueJson(HttpStatusCode.OK, AccountStatusJson("other-id", "InProgress", "2025-01-01T00:00:00Z"));
        _handler.EnqueueJson(HttpStatusCode.Accepted, "{\"restoreId\":\"restore-new\"}");
        var sut = CreateSut();

        var result = await sut.StartBlobRestoreAsync(
            DataPartition, StorageInfo(), RestorePoint, OperationId, existingRestoreId: null, CancellationToken.None);

        _ = result.Should().Be("restore-new");
        _ = _handler.Requests.Should().HaveCount(2);
        _ = _handler.Requests[0].Method.Should().Be(HttpMethod.Get);
        _ = _handler.Requests[1].Method.Should().Be(HttpMethod.Post);
    }

    [Fact]
    public async Task StartBlobRestoreAsync_ManagementPlaneError_ThrowsInvalidOperation()
    {
        _handler.EnqueueJson(HttpStatusCode.OK, AccountStatusJson(null, null));
        _handler.EnqueueJson(HttpStatusCode.InternalServerError, "boom");
        var sut = CreateSut();

        var act = async () => await sut.StartBlobRestoreAsync(
            DataPartition, StorageInfo(), RestorePoint, OperationId, null, CancellationToken.None);

        _ = await act.Should().ThrowAsync<InvalidOperationException>()
            .WithMessage("*500*boom*");
    }

    [Fact]
    public async Task StartBlobRestoreAsync_AcceptedButNoIdAnywhere_ThrowsRetryable()
    {
        _handler.EnqueueJson(HttpStatusCode.OK, AccountStatusJson(null, null));
        _handler.EnqueueJson(HttpStatusCode.OK, string.Empty);
        _handler.EnqueueJson(HttpStatusCode.OK, "{\"properties\":{}}");
        var sut = CreateSut();

        var act = async () => await sut.StartBlobRestoreAsync(
            DataPartition, StorageInfo(), RestorePoint, OperationId, null, CancellationToken.None);

        _ = await act.Should().ThrowAsync<Sidecar.Common.Exceptions.RetryableRestoreException>()
            .WithMessage("*restoreId is not visible yet*");
    }

    [Fact]
    public async Task StartBlobRestoreAsync_AcceptedButStatusLookupFails_ThrowsRetryable()
    {
        _handler.EnqueueJson(HttpStatusCode.OK, AccountStatusJson(null, null));
        _handler.EnqueueJson(HttpStatusCode.Accepted, string.Empty);
        _handler.EnqueueJson(HttpStatusCode.ServiceUnavailable, "temporarily unavailable");
        var sut = CreateSut();

        var act = async () => await sut.StartBlobRestoreAsync(
            DataPartition, StorageInfo(), RestorePoint, OperationId, null, CancellationToken.None);

        _ = await act.Should().ThrowAsync<Sidecar.Common.Exceptions.RetryableRestoreException>()
            .WithMessage("*accepted*restoreId could not be recovered*");
    }

    // ------------------------------------------------------------------------
    // StartBlobRestoreAsync — resume / idempotency against an existing restore id
    // ------------------------------------------------------------------------

    [Fact]
    public async Task StartBlobRestoreAsync_Resume_SameIdInProgress_AdoptsWithoutResubmitting()
    {
        _handler.EnqueueJson(HttpStatusCode.OK, AccountStatusJson("existing-id", "InProgress"));
        var sut = CreateSut();

        var result = await sut.StartBlobRestoreAsync(
            DataPartition, StorageInfo(), RestorePoint, OperationId,
            existingRestoreId: "existing-id", CancellationToken.None);

        _ = result.Should().Be("existing-id");
        _ = _handler.Requests.Should().ContainSingle();
        _ = _handler.Requests[0].Method.Should().Be(HttpMethod.Get);
    }

    [Fact]
    public async Task StartBlobRestoreAsync_Resume_NewerAccountId_UnrelatedPoint_ResubmitsRestore()
    {
        // The account's most-recent restore has a DIFFERENT id AND targets a different point-in-time,
        // so it is an unrelated restore that superseded ours. A newer id is NOT proof our restore
        // succeeded (it could have failed), so we must re-submit rather than assume completion.
        _handler.EnqueueJson(HttpStatusCode.OK, AccountStatusJson("unrelated-id", "InProgress", "2025-01-01T00:00:00Z"));
        _handler.EnqueueJson(HttpStatusCode.Accepted, "{\"restoreId\":\"fresh-id\"}");
        var sut = CreateSut();

        var result = await sut.StartBlobRestoreAsync(
            DataPartition, StorageInfo(), RestorePoint, OperationId,
            existingRestoreId: "old-id", CancellationToken.None);

        _ = result.Should().Be("fresh-id");
        _ = _handler.Requests.Should().HaveCount(2);
        _ = _handler.Requests[0].Method.Should().Be(HttpMethod.Get);
        _ = _handler.Requests[1].Method.Should().Be(HttpMethod.Post);
    }

    [Fact]
    public async Task StartBlobRestoreAsync_Resume_NewerAccountId_SamePoint_AdoptsLatestId()
    {
        // The account's most-recent restore has a DIFFERENT id but targets OUR point-in-time, so it
        // is our restore re-manifested. Adopt the LATEST id so the operation tracks the live restore
        // instead of the stale tracked id \u2014 no re-submit.
        _handler.EnqueueJson(HttpStatusCode.OK, AccountStatusJson(
            "latest-id", "InProgress", RestorePoint,
            ($"{DefaultContainer}/ ", $"{DefaultContainer}0")));
        var sut = CreateSut();

        var result = await sut.StartBlobRestoreAsync(
            DataPartition, StorageInfo(), RestorePoint, OperationId,
            existingRestoreId: "old-id", CancellationToken.None);

        _ = result.Should().Be("latest-id");
        _ = _handler.Requests.Should().ContainSingle();
        _ = _handler.Requests[0].Method.Should().Be(HttpMethod.Get);
    }

    [Fact]
    public async Task StartBlobRestoreAsync_Resume_ExistingIdNoLongerUsable_SubmitsNewRestore()
    {
        _handler.EnqueueJson(HttpStatusCode.OK, AccountStatusJson("stale-id", "Failed"));
        _handler.EnqueueJson(HttpStatusCode.Accepted, "{\"restoreId\":\"fresh-id\"}");
        var sut = CreateSut();

        var result = await sut.StartBlobRestoreAsync(
            DataPartition, StorageInfo(), RestorePoint, OperationId,
            existingRestoreId: "stale-id", CancellationToken.None);

        _ = result.Should().Be("fresh-id");
        _ = _handler.Requests.Should().HaveCount(2);
        _ = _handler.Requests[0].Method.Should().Be(HttpMethod.Get);
        _ = _handler.Requests[1].Method.Should().Be(HttpMethod.Post);
    }

    // ------------------------------------------------------------------------
    // WaitForBlobRestoreAsync — immediate-return fast paths (no polling)
    // ------------------------------------------------------------------------

    [Fact]
    public async Task WaitForBlobRestoreAsync_EmptyRestoreId_ReturnsImmediately_WithoutHttp()
    {
        var sut = CreateSut();

        var result = await sut.WaitForBlobRestoreAsync(
            DataPartition, StorageInfo(expectedObjectCount: 3),
            restoreId: string.Empty, RestorePoint, OperationId, CancellationToken.None);

        _ = result.TotalBlobs.Should().Be(3);
        _ = result.RestoredBlobs.Should().Be(3);
        _ = _handler.Requests.Should().BeEmpty();
    }

    // ------------------------------------------------------------------------
    // Constructor guards
    // ------------------------------------------------------------------------

    [Fact]
    public void Constructor_NullLogger_Throws()
    {
        var act = () => new BlobRestoreService(
            null!, _blobClientFactory.Object, _resolver.Object, new HttpClient(_handler), _credential.Object);
        _ = act.Should().Throw<ArgumentNullException>();
    }

    [Fact]
    public void Constructor_NullHttpClient_Throws()
    {
        var act = () => new BlobRestoreService(
            _logger.Object, _blobClientFactory.Object, _resolver.Object, null!, _credential.Object);
        _ = act.Should().Throw<ArgumentNullException>();
    }

    [Fact]
    public void Constructor_NullCredential_Throws()
    {
        var act = () => new BlobRestoreService(
            _logger.Object, _blobClientFactory.Object, _resolver.Object, new HttpClient(_handler), null!);
        _ = act.Should().Throw<ArgumentNullException>();
    }

    [Fact]
    public void Constructor_NullResourceResolver_Throws()
    {
        var act = () => new BlobRestoreService(
            _logger.Object, _blobClientFactory.Object, null!, new HttpClient(_handler), _credential.Object);
        _ = act.Should().Throw<ArgumentNullException>();
    }

    // ------------------------------------------------------------------------
    // ValidateConsistencyAsync — filemetadata (expected) vs. actual restored blobs
    // ------------------------------------------------------------------------

    [Fact]
    public async Task ValidateConsistencyAsync_ZeroExpected_EmptyStore_ReturnsConsistent()
    {
        // Revert-to-empty: the target had 0 blobs / 0 bytes. We must STILL enumerate the store and
        // confirm the range is actually empty (the PITR removed the newer blobs). An empty listing
        // matching the zero expectation is consistent.
        SetupBlobListing(new long[] { });
        var sut = CreateSut();
        var storage = StorageInfo(expectedObjectCount: 0, expectedTotalSize: 0);

        var result = await sut.ValidateConsistencyAsync(DataPartition, storage, OperationId, CancellationToken.None);

        _ = result.IsConsistent.Should().BeTrue();
        _ = result.ValidationError.Should().BeNullOrEmpty();
        // The store IS queried now, even for a zero expectation, to prove it was left empty.
        _blobClientFactory.Verify(
            f => f.GetBlobClientAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task ValidateConsistencyAsync_ZeroExpected_ResidualBlobs_ReturnsInconsistent()
    {
        // The target had 0 blobs, but the store still holds residual objects (e.g. a PITR that did
        // not remove them). This MUST be flagged as inconsistent rather than silently skipped.
        SetupBlobListing(new long[] { 85, 85, 85 });
        var sut = CreateSut();
        var storage = StorageInfo(expectedObjectCount: 0, expectedTotalSize: 0);

        var result = await sut.ValidateConsistencyAsync(DataPartition, storage, OperationId, CancellationToken.None);

        _ = result.IsConsistent.Should().BeFalse();
        _ = result.ValidationError.Should().Contain("object count mismatch")
            .And.Contain("expected 0").And.Contain("found 3");
        _ = result.ValidationError.Should().Contain("total size mismatch")
            .And.Contain("expected 0 bytes").And.Contain("found 255 bytes");
    }

    [Fact]
    public async Task ValidateConsistencyAsync_ObjectCountAbsent_SkipsObjectCountCheck()
    {
        // filemetadata.nobjects was not recorded on this version (ExpectedObjectCount is null): the
        // object-count check is skipped (and logged). The recorded size still matches, so the result
        // is consistent even though the actual count differs from any fabricated value.
        SetupBlobListing(new long[] { 1024, 512 });
        var sut = CreateSut();
        var storage = StorageInfo(expectedObjectCount: null, expectedTotalSize: 1536);

        var result = await sut.ValidateConsistencyAsync(DataPartition, storage, OperationId, CancellationToken.None);

        _ = result.IsConsistent.Should().BeTrue();
        _ = result.ValidationError.Should().BeNullOrEmpty();
    }

    [Fact]
    public async Task ValidateConsistencyAsync_TotalSizeAbsent_SkipsTotalSizeCheck()
    {
        // filemetadata.size was not recorded (ExpectedTotalSize is null): the total-size check is
        // skipped. The recorded object count still matches, so the result is consistent.
        SetupBlobListing(new long[] { 1024, 512 });
        var sut = CreateSut();
        var storage = StorageInfo(expectedObjectCount: 2, expectedTotalSize: null);

        var result = await sut.ValidateConsistencyAsync(DataPartition, storage, OperationId, CancellationToken.None);

        _ = result.IsConsistent.Should().BeTrue();
        _ = result.ValidationError.Should().BeNullOrEmpty();
    }

    [Fact]
    public async Task ValidateConsistencyAsync_BothFiguresAbsent_ReturnsConsistent()
    {
        // Neither figure was recorded: both checks are skipped (and logged). Nothing is validated,
        // so the result is consistent regardless of what the store holds. The store is still
        // enumerated for the informational log.
        SetupBlobListing(new long[] { 100, 200, 300 });
        var sut = CreateSut();
        var storage = StorageInfo(expectedObjectCount: null, expectedTotalSize: null);

        var result = await sut.ValidateConsistencyAsync(DataPartition, storage, OperationId, CancellationToken.None);

        _ = result.IsConsistent.Should().BeTrue();
        _ = result.ValidationError.Should().BeNullOrEmpty();
    }

    [Fact]
    public async Task ValidateConsistencyAsync_CountAndSizeMatch_ReturnsConsistent()
    {
        SetupBlobListing(new long[] { 1024, 1024 });
        var sut = CreateSut();
        var storage = StorageInfo(expectedObjectCount: 2, expectedTotalSize: 2048);

        var result = await sut.ValidateConsistencyAsync(DataPartition, storage, OperationId, CancellationToken.None);

        _ = result.IsConsistent.Should().BeTrue();
        _ = result.ValidationError.Should().BeNullOrEmpty();
    }

    [Fact]
    public async Task ValidateConsistencyAsync_ObjectCountMismatch_ReturnsInconsistent()
    {
        SetupBlobListing(new long[] { 1024 });
        var sut = CreateSut();
        // expectedTotalSize matches the single blob so ONLY the object count is inconsistent.
        var storage = StorageInfo(expectedObjectCount: 2, expectedTotalSize: 1024);

        var result = await sut.ValidateConsistencyAsync(DataPartition, storage, OperationId, CancellationToken.None);

        _ = result.IsConsistent.Should().BeFalse();
        _ = result.ValidationError.Should().Contain("object count mismatch")
            .And.Contain("expected 2").And.Contain("found 1");
    }

    [Fact]
    public async Task ValidateConsistencyAsync_TotalSizeMismatch_ReturnsInconsistent()
    {
        SetupBlobListing(new long[] { 1024, 512 });
        var sut = CreateSut();
        var storage = StorageInfo(expectedObjectCount: 2, expectedTotalSize: 2048);

        var result = await sut.ValidateConsistencyAsync(DataPartition, storage, OperationId, CancellationToken.None);

        _ = result.IsConsistent.Should().BeFalse();
        _ = result.ValidationError.Should().Contain("total size mismatch")
            .And.Contain("expected 2048").And.Contain("found 1536");
    }

    [Fact]
    public async Task ValidateConsistencyAsync_BothCountAndSizeMismatch_ReportsBoth()
    {
        SetupBlobListing(new long[] { 512 });
        var sut = CreateSut();
        var storage = StorageInfo(expectedObjectCount: 3, expectedTotalSize: 4096);

        var result = await sut.ValidateConsistencyAsync(DataPartition, storage, OperationId, CancellationToken.None);

        _ = result.IsConsistent.Should().BeFalse();
        _ = result.ValidationError.Should().Contain("object count mismatch").And.Contain("total size mismatch");
    }

    [Fact]
    public async Task ValidateConsistencyAsync_UniformPolicy_ListsWithVirtualFolderPrefix()
    {
        string? observedPrefix = null;
        SetupBlobListing(new long[] { 100, 100 }, prefix => observedPrefix = prefix);
        var sut = CreateSut();
        var storage = StorageInfo(
            container: UniformPolicyContainer, virtualFolder: DatasetUuid,
            expectedObjectCount: 2, expectedTotalSize: 200);

        _ = await sut.ValidateConsistencyAsync(DataPartition, storage, OperationId, CancellationToken.None);

        // Uniform access policy scopes the listing to the dataset's virtual-folder prefix.
        _ = observedPrefix.Should().Be($"{DatasetUuid}/");
    }

    [Fact]
    public async Task ValidateConsistencyAsync_DatasetPolicy_ListsWholeContainer_NoPrefix()
    {
        string? observedPrefix = "unset";
        SetupBlobListing(new long[] { 100 }, prefix => observedPrefix = prefix);
        var sut = CreateSut();
        var storage = StorageInfo(
            container: DatasetPolicyContainer, virtualFolder: null,
            expectedObjectCount: 1, expectedTotalSize: 100);

        _ = await sut.ValidateConsistencyAsync(DataPartition, storage, OperationId, CancellationToken.None);

        // Dedicated-container (dataset) policy lists the whole container, so no prefix is applied.
        _ = observedPrefix.Should().BeNull();
    }

    /// <summary>
    /// Wires <see cref="IBlobClientFactory"/> → <see cref="IBlobClient"/> → a mocked
    /// <see cref="BlobContainerClient"/> whose <c>GetBlobsAsync</c> returns one page of blobs with
    /// the given content lengths, optionally capturing the prefix the SUT lists with.
    /// </summary>
    private void SetupBlobListing(IReadOnlyList<long> blobSizes, Action<string?>? capturePrefix = null)
    {
        var containerClientMock = new Mock<BlobContainerClient>();
        var blobClientMock = new Mock<IBlobClient>();

        _ = blobClientMock
            .Setup(c => c.GetContainerClient(It.IsAny<string>()))
            .Returns(containerClientMock.Object);
        _ = _blobClientFactory
            .Setup(f => f.GetBlobClientAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(blobClientMock.Object);

        var items = blobSizes
            .Select((size, i) => BlobsModelFactory.BlobItem(
                name: $"blob-{i}",
                properties: BlobsModelFactory.BlobItemProperties(accessTierInferred: false, contentLength: size)))
            .ToList();
        var page = Page<BlobItem>.FromValues(items, continuationToken: null, new Mock<Response>().Object);
        var pages = AsyncPageable<BlobItem>.FromPages(new[] { page });

        _ = containerClientMock
            .Setup(c => c.GetBlobsAsync(
                It.IsAny<BlobTraits>(), It.IsAny<BlobStates>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .Returns((BlobTraits _, BlobStates _, string prefix, CancellationToken _) =>
            {
                capturePrefix?.Invoke(prefix);
                return pages;
            });
    }

    // ------------------------------------------------------------------------
    // Test double: records every request and replays queued responses in order.
    // ------------------------------------------------------------------------

    private sealed class StubHttpMessageHandler : HttpMessageHandler
    {
        private readonly Queue<Func<HttpRequestMessage, HttpResponseMessage>> _responders = new();

        public List<RecordedRequest> Requests { get; } = new();

        public void EnqueueJson(HttpStatusCode status, string body)
            => _responders.Enqueue(_ => new HttpResponseMessage(status)
            {
                Content = new StringContent(body ?? string.Empty, Encoding.UTF8, "application/json"),
            });

        protected override async Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request, CancellationToken cancellationToken)
        {
            string? body = null;
            if (request.Content is not null)
            {
                body = await request.Content.ReadAsStringAsync(cancellationToken);
            }

            Requests.Add(new RecordedRequest(
                request.Method,
                request.RequestUri!,
                body,
                request.Headers.Authorization));

            if (_responders.Count == 0)
            {
                throw new InvalidOperationException(
                    $"No stub response queued for {request.Method} {request.RequestUri}");
            }

            return _responders.Dequeue()(request);
        }
    }

    private sealed record RecordedRequest(
        HttpMethod Method,
        Uri Uri,
        string? Body,
        System.Net.Http.Headers.AuthenticationHeaderValue? Authorization);
}
