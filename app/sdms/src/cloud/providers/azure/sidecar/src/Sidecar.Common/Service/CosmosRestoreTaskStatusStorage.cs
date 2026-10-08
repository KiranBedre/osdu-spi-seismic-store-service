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

namespace Sidecar.Common.Service;

using System.Diagnostics;
using Microsoft.Azure.Cosmos;
using Microsoft.Extensions.Logging;
using Sidecar.Common.Interface;
using Sidecar.Common.Model;
using Sidecar.Common.Utility;

/// <summary>
/// Cosmos DB implementation for storing restore operation status.
/// Uses ETag-based optimistic concurrency.
/// </summary>
public class CosmosRestoreTaskStatusStorage(
    ILogger<CosmosRestoreTaskStatusStorage> logger,
    ICosmosClientFactory cosmosClientFactory) : IRestoreOperationStatusStorage
{
    private readonly ILogger<CosmosRestoreTaskStatusStorage> _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    private readonly ICosmosClientFactory _cosmosClientFactory = cosmosClientFactory ?? throw new ArgumentNullException(nameof(cosmosClientFactory));

    /// <inheritdoc/>
    public async Task<TrackedRestoreStatus?> GetRestoreOperationStatusAsync(string dataPartitionId, string operationId, CancellationToken ct = default)
    {
        var stopwatch = Stopwatch.StartNew();
        var endpoint = await _cosmosClientFactory.GetCosmosConnectionEndpointAsync(dataPartitionId, ct);
        // Factory reuses a cached CosmosClient per endpoint; clients are not created per request.
        var cosmosClient = _cosmosClientFactory.GetCosmosClient(endpoint);
        var container = cosmosClient
            .GetDatabase(Constants.CosmosDb.DATABASE_ID)
            .GetContainer(Constants.CosmosDb.RESTORE_STATUS_CONTAINER_ID);

        try
        {
            var response = await container.ReadItemAsync<RestoreOperationStatus>(
                operationId,
                new PartitionKey(operationId),
                cancellationToken: ct);

            stopwatch.Stop();
            _logger.LogInformation(
                "CosmosDB READ restore status - OperationId: {OperationId}, Duration: {DurationMs}ms, RU: {RU}",
                operationId, stopwatch.ElapsedMilliseconds, response.RequestCharge);

            return new TrackedRestoreStatus(response.Resource, response.ETag);
        }
        catch (CosmosException ex) when (ex.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            stopwatch.Stop();
            _logger.LogWarning(
                "CosmosDB READ restore status not found - OperationId: {OperationId}, Duration: {DurationMs}ms",
                operationId, stopwatch.ElapsedMilliseconds);
            return null;
        }
        catch (CosmosException ex)
        {
            stopwatch.Stop();
            _logger.LogError(ex,
                "CosmosDB READ restore status failed - OperationId: {OperationId}, StatusCode: {StatusCode}, Duration: {DurationMs}ms",
                operationId, ex.StatusCode, stopwatch.ElapsedMilliseconds);
            throw;
        }
    }

    /// <inheritdoc/>
    public async Task<TrackedRestoreStatus> CreateStatusAsync(string dataPartitionId, RestoreOperationStatus status, CancellationToken ct = default)
    {
        var stopwatch = Stopwatch.StartNew();
        var endpoint = await _cosmosClientFactory.GetCosmosConnectionEndpointAsync(dataPartitionId, ct);
        var cosmosClient = _cosmosClientFactory.GetCosmosClient(endpoint);
        var container = cosmosClient
            .GetDatabase(Constants.CosmosDb.DATABASE_ID)
            .GetContainer(Constants.CosmosDb.RESTORE_STATUS_CONTAINER_ID);

        try
        {
            var response = await container.CreateItemAsync(
                status,
                new PartitionKey(status.OperationId),
                cancellationToken: ct);

            stopwatch.Stop();
            _logger.LogInformation(
                "CosmosDB CREATE restore status - OperationId: {OperationId}, Duration: {DurationMs}ms, RU: {RU}",
                status.OperationId, stopwatch.ElapsedMilliseconds, response.RequestCharge);

            return new TrackedRestoreStatus(response.Resource, response.ETag);
        }
        catch (CosmosException ex) when (ex.StatusCode == System.Net.HttpStatusCode.Conflict)
        {
            stopwatch.Stop();
            // Idempotent get-or-create. A Conflict means a status doc for this operationId already
            // exists — created by a concurrent delivery of the SAME message. Azure Storage Queues are
            // at-least-once and can redeliver when the visibility timeout lapses during a multi-hour
            // restore, so two deliveries can both read null and both attempt create; the loser gets a
            // 409. That is the desired end state, not a failure, so re-read and return the existing
            // doc instead of rethrowing (which the executor would misclassify and wrongly mark the
            // operation Failed). Cosmos id-uniqueness is the real guard, not the executor's prior GET.
            _logger.LogInformation(
                "CosmosDB CREATE restore status conflicted (already exists, concurrent delivery); returning existing doc - OperationId: {OperationId}, Duration: {DurationMs}ms",
                status.OperationId, stopwatch.ElapsedMilliseconds);

            var existing = await GetRestoreOperationStatusAsync(dataPartitionId, status.OperationId, ct);
            return existing
                ?? throw new InvalidOperationException(
                    $"Restore status create conflicted for OperationId {status.OperationId} but the existing document could not be read back.");
        }
        catch (CosmosException ex)
        {
            stopwatch.Stop();
            _logger.LogError(ex,
                "CosmosDB CREATE restore status failed - OperationId: {OperationId}, StatusCode: {StatusCode}, Duration: {DurationMs}ms",
                status.OperationId, ex.StatusCode, stopwatch.ElapsedMilliseconds);
            throw;
        }
    }

    /// <inheritdoc/>
    public async Task<TrackedRestoreStatus> SaveStatusAsync(string dataPartitionId, TrackedRestoreStatus trackedStatus, CancellationToken ct = default)
    {
        var status = trackedStatus.Document;
        var stopwatch = Stopwatch.StartNew();

        var endpoint = await _cosmosClientFactory.GetCosmosConnectionEndpointAsync(dataPartitionId, ct);
        var cosmosClient = _cosmosClientFactory.GetCosmosClient(endpoint);
        var container = cosmosClient
            .GetDatabase(Constants.CosmosDb.DATABASE_ID)
            .GetContainer(Constants.CosmosDb.RESTORE_STATUS_CONTAINER_ID);

        status.LastUpdatedAt = DateTimeExtensions.UtcNowISOString();

        try
        {
            var requestOptions = new ItemRequestOptions { IfMatchEtag = trackedStatus.ETag };
            var response = await container.ReplaceItemAsync(
                status,
                status.OperationId,
                new PartitionKey(status.OperationId),
                requestOptions,
                cancellationToken: ct);

            stopwatch.Stop();
            _logger.LogInformation(
                "CosmosDB REPLACE restore status - OperationId: {OperationId}, Status: {Status}, Duration: {DurationMs}ms, RU: {RU}",
                status.OperationId, status.Status, stopwatch.ElapsedMilliseconds, response.RequestCharge);

            return new TrackedRestoreStatus(response.Resource, response.ETag);
        }
        catch (CosmosException ex) when (ex.StatusCode == System.Net.HttpStatusCode.PreconditionFailed)
        {
            stopwatch.Stop();
            _logger.LogError(ex,
                "CosmosDB REPLACE restore status ETag conflict - OperationId: {OperationId}, ETag: {ETag}, Duration: {DurationMs}ms",
                status.OperationId, trackedStatus.ETag, stopwatch.ElapsedMilliseconds);
            throw;
        }
        catch (CosmosException ex)
        {
            stopwatch.Stop();
            _logger.LogError(ex,
                "CosmosDB REPLACE restore status failed - OperationId: {OperationId}, StatusCode: {StatusCode}, Duration: {DurationMs}ms",
                status.OperationId, ex.StatusCode, stopwatch.ElapsedMilliseconds);
            throw;
        }
    }
}
