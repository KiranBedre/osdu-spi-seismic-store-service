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
using Microsoft.Azure.Cosmos;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using Sidecar.Common.Utility;
using ModelStatus = Sidecar.Common.Model.RestoreOperationStatus;

public class CosmosRestoreTaskStatusStorageTests
{
    private const string Tenant = "opendes";
    private const string TestEndpoint = "https://test.documents.azure.com";
    private const string TestOperationId = "op-12345";
    private const string TestETag = "etag-existing";

    private readonly Mock<ILogger<CosmosRestoreTaskStatusStorage>> _loggerMock = new();
    private readonly Mock<ICosmosClientFactory> _cosmosClientFactoryMock = new();
    private readonly Mock<Container> _containerMock = new();

    public CosmosRestoreTaskStatusStorageTests()
    {
        var database = new Mock<Database>();
        var cosmosClient = new Mock<CosmosClient>();

        _ = database
            .Setup(d => d.GetContainer(Constants.CosmosDb.RESTORE_STATUS_CONTAINER_ID))
            .Returns(_containerMock.Object);
        _ = cosmosClient
            .Setup(c => c.GetDatabase(Constants.CosmosDb.DATABASE_ID))
            .Returns(database.Object);

        _ = _cosmosClientFactoryMock
            .Setup(f => f.GetCosmosConnectionEndpointAsync(Tenant, It.IsAny<CancellationToken>()))
            .ReturnsAsync(TestEndpoint);
        _ = _cosmosClientFactoryMock
            .Setup(f => f.GetCosmosClient(TestEndpoint))
            .Returns(cosmosClient.Object);
    }

    private CosmosRestoreTaskStatusStorage CreateStorage() =>
        new(_loggerMock.Object, _cosmosClientFactoryMock.Object);

    private static ModelStatus NewStatus(string status) => new()
    {
        OperationId = TestOperationId,
        SdPath = "sd://opendes/subproj1/pathA/datasetX",
        RestorePointInTime = "2026-01-01T00:00:00Z",
        Status = status,
    };

    [Fact]
    public void RestoreStatusRoundTrip_PreservesApiOwnedFields()
    {
        const string json = """
            {
              "id": "op-12345",
              "operationId": "op-12345",
              "tenant": "opendes",
              "subproject": "subproj1",
              "sdPath": "sd://opendes/subproj1/pathA/datasetX",
              "restorePointInTime": "2026-01-01T00:00:00Z",
              "createdBy": "user@example.com",
              "status": "Enqueued",
              "startedAt": "2026-01-01T00:01:00Z",
              "completedAt": "2026-01-01T00:02:00Z",
              "lastUpdatedAt": "2026-01-01T00:02:00Z"
            }
            """;

        var status = JsonConvert.DeserializeObject<ModelStatus>(json)!;
        status.Status = "Succeeded";
        var saved = JObject.Parse(JsonConvert.SerializeObject(status));

        _ = status.StartedAt.Should().Be("2026-01-01T00:01:00Z");
        _ = status.CompletedAt.Should().Be("2026-01-01T00:02:00Z");
        _ = saved["tenant"]!.Value<string>().Should().Be("opendes");
        _ = saved["subproject"]!.Value<string>().Should().Be("subproj1");
        _ = saved.ContainsKey("startedAt").Should().BeTrue();
        _ = saved.ContainsKey("completedAt").Should().BeTrue();
    }

    [Fact]
    public async Task CreateStatusAsync_WhenCreateSucceeds_ReturnsCreatedDoc()
    {
        var created = NewStatus("InProgress");
        var createResponse = new Mock<ItemResponse<ModelStatus>>();
        _ = createResponse.Setup(r => r.Resource).Returns(created);
        _ = createResponse.Setup(r => r.ETag).Returns("etag-created");

        _ = _containerMock
            .Setup(c => c.CreateItemAsync(
                It.IsAny<ModelStatus>(), It.IsAny<PartitionKey?>(), It.IsAny<ItemRequestOptions>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(createResponse.Object);

        var result = await CreateStorage().CreateStatusAsync(Tenant, created, CancellationToken.None);

        _ = result.Should().NotBeNull();
        _ = result.ETag.Should().Be("etag-created");
        // The success path must not fall back to a read.
        _containerMock.Verify(
            c => c.ReadItemAsync<ModelStatus>(It.IsAny<string>(), It.IsAny<PartitionKey>(), It.IsAny<ItemRequestOptions>(), It.IsAny<CancellationToken>()),
            Times.Never);
    }

    [Fact]
    public async Task CreateStatusAsync_WhenConflict_ReturnsExistingDocInsteadOfThrowing()
    {
        // A concurrent delivery of the same message already created the doc: CreateItemAsync throws
        // 409 Conflict. The idempotent get-or-create must swallow it, re-read, and return the existing
        // doc — NOT rethrow (which the executor would misclassify as a failure).
        _ = _containerMock
            .Setup(c => c.CreateItemAsync(
                It.IsAny<ModelStatus>(), It.IsAny<PartitionKey?>(), It.IsAny<ItemRequestOptions>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new CosmosException("conflict", HttpStatusCode.Conflict, 0, "activity", 1.0));

        var existing = NewStatus("InProgress");
        var readResponse = new Mock<ItemResponse<ModelStatus>>();
        _ = readResponse.Setup(r => r.Resource).Returns(existing);
        _ = readResponse.Setup(r => r.ETag).Returns(TestETag);
        _ = _containerMock
            .Setup(c => c.ReadItemAsync<ModelStatus>(
                TestOperationId, It.IsAny<PartitionKey>(), It.IsAny<ItemRequestOptions>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(readResponse.Object);

        var result = await CreateStorage().CreateStatusAsync(Tenant, NewStatus("InProgress"), CancellationToken.None);

        _ = result.Should().NotBeNull();
        _ = result.ETag.Should().Be(TestETag);
        _ = result.Document.OperationId.Should().Be(TestOperationId);
    }

    [Fact]
    public async Task CreateStatusAsync_WhenConflictButDocGone_Throws()
    {
        // Defensive: if the doc vanishes between the 409 and the re-read, surface a clear failure
        // rather than a NullReferenceException.
        _ = _containerMock
            .Setup(c => c.CreateItemAsync(
                It.IsAny<ModelStatus>(), It.IsAny<PartitionKey?>(), It.IsAny<ItemRequestOptions>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new CosmosException("conflict", HttpStatusCode.Conflict, 0, "activity", 1.0));
        _ = _containerMock
            .Setup(c => c.ReadItemAsync<ModelStatus>(
                It.IsAny<string>(), It.IsAny<PartitionKey>(), It.IsAny<ItemRequestOptions>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new CosmosException("not found", HttpStatusCode.NotFound, 0, "activity", 1.0));

        var act = () => CreateStorage().CreateStatusAsync(Tenant, NewStatus("InProgress"), CancellationToken.None);

        _ = await act.Should().ThrowAsync<InvalidOperationException>();
    }

    [Fact]
    public async Task CreateStatusAsync_WhenNonConflictCosmosError_Rethrows()
    {
        // Non-conflict Cosmos failures must still propagate unchanged.
        _ = _containerMock
            .Setup(c => c.CreateItemAsync(
                It.IsAny<ModelStatus>(), It.IsAny<PartitionKey?>(), It.IsAny<ItemRequestOptions>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new CosmosException("boom", HttpStatusCode.InternalServerError, 0, "activity", 1.0));

        var act = () => CreateStorage().CreateStatusAsync(Tenant, NewStatus("InProgress"), CancellationToken.None);

        _ = await act.Should().ThrowAsync<CosmosException>();
        _containerMock.Verify(
            c => c.ReadItemAsync<ModelStatus>(It.IsAny<string>(), It.IsAny<PartitionKey>(), It.IsAny<ItemRequestOptions>(), It.IsAny<CancellationToken>()),
            Times.Never);
    }
}
