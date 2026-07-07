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
using Azure.Core;
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

    private readonly Mock<ILogger<BlobRestoreService>> _logger = new();
    private readonly Mock<IBlobClientFactory> _blobClientFactory = new();
    private readonly Mock<IAzureStorageResourceResolver> _resolver = new();
    private readonly Mock<TokenCredential> _credential = new();
    private readonly StubHttpMessageHandler _handler = new();

    public BlobRestoreServiceTests()
    {
        _resolver.SetupGet(r => r.SubscriptionId).Returns(SubscriptionId);
        _resolver.Setup(r => r.ResolveResourceGroupName(It.IsAny<string>())).Returns(ResourceGroup);
        _resolver
            .Setup(r => r.ResolveStorageAccountNameAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(StorageAccount);
        _credential
            .Setup(c => c.GetTokenAsync(It.IsAny<TokenRequestContext>(), It.IsAny<CancellationToken>()))
            .Returns(new ValueTask<AccessToken>(new AccessToken(BearerToken, DateTimeOffset.UtcNow.AddHours(1))));
    }

    private BlobRestoreService CreateSut()
        => new(_logger.Object, _blobClientFactory.Object, _resolver.Object, new HttpClient(_handler), _credential.Object);

    // gcsurl is stored as "<container>/<virtualFolder>" for uniform-access datasets and just
    // "<container>" for dataset-access datasets (no scheme prefix), e.g.
    //   ss-local-psmb3nw5vxy8n52/64cc33b9-e313-4453-994f-400bda80ef96
    private static DatasetStorageInfo StorageInfo(
        string container = "container1",
        string? virtualFolder = null,
        params string[] blobs)
        => new(
            GcsUrl: string.IsNullOrWhiteSpace(virtualFolder) ? container : $"{container}/{virtualFolder.Trim('/')}",
            ContainerName: container,
            VirtualFolder: virtualFolder,
            BlobPaths: blobs.Length == 0 ? new List<string> { "blob1", "blob2" } : blobs.ToList());

    private static string AccountStatusJson(string? restoreId, string? status)
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
        return $"{{\"properties\":{{\"blobRestoreStatus\":{{{string.Join(",", inner)}}}}}}}";
    }

    // ------------------------------------------------------------------------
    // StartBlobRestoreAsync — nothing to do
    // ------------------------------------------------------------------------

    [Fact]
    public async Task StartBlobRestoreAsync_EmptyBlobList_ReturnsEmpty_AndIssuesNoRequest()
    {
        var sut = CreateSut();
        var storage = new DatasetStorageInfo("container1", "container1", null, new List<string>());

        var result = await sut.StartBlobRestoreAsync(
            DataPartition, storage, RestorePoint, OperationId, existingRestoreId: null, CancellationToken.None);

        result.Should().BeEmpty();
        _handler.Requests.Should().BeEmpty();
    }

    // ------------------------------------------------------------------------
    // StartBlobRestoreAsync — fresh submit (the core PITR request)
    // ------------------------------------------------------------------------

    [Fact]
    public async Task StartBlobRestoreAsync_Success_SubmitsPitrRequest_AndReturnsRestoreId()
    {
        _handler.EnqueueJson(HttpStatusCode.Accepted, "{\"restoreId\":\"restore-abc\"}");
        var sut = CreateSut();

        var result = await sut.StartBlobRestoreAsync(
            DataPartition, StorageInfo(), RestorePoint, OperationId, existingRestoreId: null, CancellationToken.None);

        result.Should().Be("restore-abc");

        _handler.Requests.Should().ContainSingle();
        var req = _handler.Requests[0];
        req.Method.Should().Be(HttpMethod.Post);
        req.Uri.ToString().Should().Contain(
            $"subscriptions/{SubscriptionId}/resourceGroups/{ResourceGroup}" +
            $"/providers/Microsoft.Storage/storageAccounts/{StorageAccount}/restoreBlobRanges");
        req.Uri.ToString().Should().Contain($"api-version={Constants.RestoreConfiguration.STORAGE_MANAGEMENT_API_VERSION}");
        req.Authorization!.Scheme.Should().Be("Bearer");
        req.Authorization.Parameter.Should().Be(BearerToken);
    }

    [Fact]
    public async Task StartBlobRestoreAsync_DatasetPolicy_ScopesRangeToDedicatedContainer()
    {
        // Dataset access policy: the dataset gets its OWN container whose name embeds the dataset
        // UUID (hyphen-joined), and there is NO virtual folder. gcsurl example:
        //   ss-local-psmb3nw5vxy8n52-64cc33b9-e313-4453-994f-400bda80ef96
        //
        // Azure restoreBlobRanges is a half-open range [startRange, endRange): startRange is
        // inclusive, endRange is EXCLUSIVE. The endRange sentinel "prefix/~" (0x7E, highest
        // printable ASCII) means "restore everything lexicographically below prefix/~", capturing
        // the entire prefix subtree without spilling into sibling prefixes.
        _handler.EnqueueJson(HttpStatusCode.Accepted, "{\"restoreId\":\"restore-abc\"}");
        var sut = CreateSut();

        _ = await sut.StartBlobRestoreAsync(
            DataPartition, StorageInfo(container: DatasetPolicyContainer, virtualFolder: null),
            RestorePoint, OperationId, null, CancellationToken.None);

        var body = _handler.Requests[0].Body!;
        body.Should().Contain("\"timeToRestore\":");
        body.Should().Contain($"\"startRange\":\"{DatasetPolicyContainer}/\"");
        body.Should().Contain($"\"endRange\":\"{DatasetPolicyContainer}/~\"");
    }

    [Fact]
    public async Task StartBlobRestoreAsync_UniformPolicy_ScopesRangeToVirtualFolderPrefix()
    {
        // Uniform access policy: datasets SHARE a container and are separated by a virtual folder
        // (the dataset UUID). gcsurl example:
        //   ss-local-psmb3nw5vxy8n52/64cc33b9-e313-4453-994f-400bda80ef96
        //
        // Half-open range [startRange, endRange) with an EXCLUSIVE endRange: the sibling-folder
        // boundary is respected because e.g. "c/aab/..." sorts ABOVE the exclusive end "c/aaa/~".
        _handler.EnqueueJson(HttpStatusCode.Accepted, "{\"restoreId\":\"restore-abc\"}");
        var sut = CreateSut();

        _ = await sut.StartBlobRestoreAsync(
            DataPartition,
            StorageInfo(container: UniformPolicyContainer, virtualFolder: DatasetUuid),
            RestorePoint, OperationId, null, CancellationToken.None);

        var body = _handler.Requests[0].Body!;
        body.Should().Contain($"\"startRange\":\"{UniformPolicyContainer}/{DatasetUuid}/\"");
        body.Should().Contain($"\"endRange\":\"{UniformPolicyContainer}/{DatasetUuid}/~\"");
    }

    [Fact]
    public async Task StartBlobRestoreAsync_ResponseOmitsId_RecoversIdFromAccountStatus()
    {
        // POST accepted but body carries no restoreId, then account status GET supplies it.
        _handler.EnqueueJson(HttpStatusCode.OK, string.Empty);
        _handler.EnqueueJson(HttpStatusCode.OK, AccountStatusJson("recovered-id", "InProgress"));
        var sut = CreateSut();

        var result = await sut.StartBlobRestoreAsync(
            DataPartition, StorageInfo(), RestorePoint, OperationId, null, CancellationToken.None);

        result.Should().Be("recovered-id");
        _handler.Requests.Should().HaveCount(2);
        _handler.Requests[0].Method.Should().Be(HttpMethod.Post);
        _handler.Requests[1].Method.Should().Be(HttpMethod.Get);
    }

    [Fact]
    public async Task StartBlobRestoreAsync_Conflict_AdoptsInFlightRestore()
    {
        _handler.EnqueueJson(HttpStatusCode.Conflict, string.Empty);
        _handler.EnqueueJson(HttpStatusCode.OK, AccountStatusJson("inflight-id", "InProgress"));
        var sut = CreateSut();

        var result = await sut.StartBlobRestoreAsync(
            DataPartition, StorageInfo(), RestorePoint, OperationId, null, CancellationToken.None);

        result.Should().Be("inflight-id");
    }

    [Fact]
    public async Task StartBlobRestoreAsync_ManagementPlaneError_ThrowsInvalidOperation()
    {
        _handler.EnqueueJson(HttpStatusCode.InternalServerError, "boom");
        var sut = CreateSut();

        var act = async () => await sut.StartBlobRestoreAsync(
            DataPartition, StorageInfo(), RestorePoint, OperationId, null, CancellationToken.None);

        await act.Should().ThrowAsync<InvalidOperationException>()
            .WithMessage("*500*boom*");
    }

    [Fact]
    public async Task StartBlobRestoreAsync_AcceptedButNoIdAnywhere_ThrowsInvalidOperation()
    {
        _handler.EnqueueJson(HttpStatusCode.OK, string.Empty);
        _handler.EnqueueJson(HttpStatusCode.OK, "{\"properties\":{}}");
        var sut = CreateSut();

        var act = async () => await sut.StartBlobRestoreAsync(
            DataPartition, StorageInfo(), RestorePoint, OperationId, null, CancellationToken.None);

        await act.Should().ThrowAsync<InvalidOperationException>()
            .WithMessage("*no restoreId*");
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

        result.Should().Be("existing-id");
        _handler.Requests.Should().ContainSingle();
        _handler.Requests[0].Method.Should().Be(HttpMethod.Get);
    }

    [Fact]
    public async Task StartBlobRestoreAsync_Resume_NewerAccountId_AdoptsLatestForTracking()
    {
        _handler.EnqueueJson(HttpStatusCode.OK, AccountStatusJson("newer-id", "Complete"));
        var sut = CreateSut();

        var result = await sut.StartBlobRestoreAsync(
            DataPartition, StorageInfo(), RestorePoint, OperationId,
            existingRestoreId: "old-id", CancellationToken.None);

        result.Should().Be("newer-id");
        _handler.Requests.Should().ContainSingle();
        _handler.Requests[0].Method.Should().Be(HttpMethod.Get);
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

        result.Should().Be("fresh-id");
        _handler.Requests.Should().HaveCount(2);
        _handler.Requests[0].Method.Should().Be(HttpMethod.Get);
        _handler.Requests[1].Method.Should().Be(HttpMethod.Post);
    }

    // ------------------------------------------------------------------------
    // WaitForBlobRestoreAsync — immediate-return fast paths (no polling)
    // ------------------------------------------------------------------------

    [Fact]
    public async Task WaitForBlobRestoreAsync_NoBlobs_ReturnsImmediately_WithoutHttp()
    {
        var sut = CreateSut();
        var storage = new DatasetStorageInfo("container1", "container1", null, new List<string>());

        var result = await sut.WaitForBlobRestoreAsync(
            DataPartition, storage, restoreId: "restore-abc", OperationId, CancellationToken.None);

        result.TotalBlobs.Should().Be(0);
        result.RestoredBlobs.Should().Be(0);
        _handler.Requests.Should().BeEmpty();
    }

    [Fact]
    public async Task WaitForBlobRestoreAsync_EmptyRestoreId_ReturnsImmediately_WithoutHttp()
    {
        var sut = CreateSut();

        var result = await sut.WaitForBlobRestoreAsync(
            DataPartition, StorageInfo(blobs: new[] { "b1", "b2", "b3" }),
            restoreId: string.Empty, OperationId, CancellationToken.None);

        result.TotalBlobs.Should().Be(3);
        result.RestoredBlobs.Should().Be(3);
        _handler.Requests.Should().BeEmpty();
    }

    // ------------------------------------------------------------------------
    // Constructor guards
    // ------------------------------------------------------------------------

    [Fact]
    public void Constructor_NullLogger_Throws()
    {
        var act = () => new BlobRestoreService(
            null!, _blobClientFactory.Object, _resolver.Object, new HttpClient(_handler), _credential.Object);
        act.Should().Throw<ArgumentNullException>();
    }

    [Fact]
    public void Constructor_NullHttpClient_Throws()
    {
        var act = () => new BlobRestoreService(
            _logger.Object, _blobClientFactory.Object, _resolver.Object, null!, _credential.Object);
        act.Should().Throw<ArgumentNullException>();
    }

    [Fact]
    public void Constructor_NullCredential_Throws()
    {
        var act = () => new BlobRestoreService(
            _logger.Object, _blobClientFactory.Object, _resolver.Object, new HttpClient(_handler), null!);
        act.Should().Throw<ArgumentNullException>();
    }

    [Fact]
    public void Constructor_NullResourceResolver_Throws()
    {
        var act = () => new BlobRestoreService(
            _logger.Object, _blobClientFactory.Object, null!, new HttpClient(_handler), _credential.Object);
        act.Should().Throw<ArgumentNullException>();
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
