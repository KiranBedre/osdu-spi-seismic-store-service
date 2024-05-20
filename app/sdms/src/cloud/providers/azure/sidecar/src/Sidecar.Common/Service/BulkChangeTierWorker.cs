// ============================================================================
// Copyright 2017-2023, Microsoft
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

using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Specialized;
using Microsoft.Extensions.Logging;
using System.Threading.Tasks.Dataflow;

using Interface;
using Sidecar.Common.Model;
using Sidecar.Common.Utility;
using Azure.Storage.Blobs.Models;

public class BulkChangeTierWorker : IBulkChangeTierWorker
{
    private readonly ILogger<BulkChangeTierWorker> _logger;
    private readonly IChangeTierTaskStatusStorage _changeTierTasks;
    private readonly IMetadataTierUpdater _metadataTierUpdater;
    private readonly IBlobClientFactory _blobClientFactory;
    private AccessTier _tier;
    private bool _foundErrors = false;

    public BulkChangeTierWorker(
        ILogger<BulkChangeTierWorker> logger,
        IChangeTierTaskStatusStorage changeTierTasks,
        IMetadataTierUpdater metadataTierUpdater,
        IBlobClientFactory blobClientFactory)
    {
        _logger = logger;
        _changeTierTasks = changeTierTasks;
        _metadataTierUpdater = metadataTierUpdater;
        _blobClientFactory = blobClientFactory;
    }

    public async Task<bool> RunBulkChangeTierAsync(string dataPartitionId, string operationId, string tier, List<ChangeTierItem> itemsToChangeTier, CancellationToken ct)
    {
        var blobClient = await _blobClientFactory.GetBlobClientAsync(dataPartitionId, ct);

        _foundErrors = false;
        _tier = tier;

        _logger.LogInformation("Started blob change tier, it will change tier of {Count} items", itemsToChangeTier.Count);
        await _changeTierTasks.UpdateFieldStatusOperationAsync(operationId, Constants.ChangeTierOperationStatus.STATUS, Status.InProgress.ToString(), ct);
        await _changeTierTasks.UpdateFieldStatusOperationAsync(operationId, Constants.ChangeTierOperationStatus.STATUS_DESCRIPTION, Status.InProgress.Description(), ct);

        await Parallel.ForEachAsync(itemsToChangeTier,
            new ParallelOptions { MaxDegreeOfParallelism = Environment.ProcessorCount, CancellationToken = ct },
            async (item, innerCt) => await ProcessItemChangeTierAsync(dataPartitionId, blobClient, operationId, item, innerCt)
            );

        return _foundErrors;
    }

    private async Task ProcessItemChangeTierAsync(string dataPartitionId, IBlobClient blobClient, string operationId, ChangeTierItem item, CancellationToken ct)
    {
        if (item.Gcsurl is null)
        {
            _logger.LogError("Gcsurl is null for item {ItemId}", item.Id);
            _foundErrors = true;
            await _changeTierTasks.IncrementCountAsync(operationId, Constants.ChangeTierOperationStatus.FAILED_CNT, ct);
            return;
        }

        string containerName;
        string? virtualFolderName;

        try
        {
            (containerName, virtualFolderName) = Utils.ParseContainerAndFolderName(item.Gcsurl);
        }
        catch (ArgumentException e)
        {
            _logger.LogError("Could not parse gcsurl {ItemGcsurl}: {EMessage}", item.Gcsurl, e.Message);
            _foundErrors = true;
            await _changeTierTasks.IncrementCountAsync(operationId, Constants.ChangeTierOperationStatus.FAILED_CNT, ct);
            return;
        }

        var containerClient = blobClient.GetContainerClient(containerName);

        var errors = new List<string>();
        if (virtualFolderName is not null)
        {
            _logger.LogInformation("Changing tier for blobs in container {ContainerName} with prefix {VirtualFolderName}", containerName, virtualFolderName);
            try
            {
                await ChangeBlobsTierInBulkAsync(blobClient, containerName, virtualFolderName, containerClient, errors, ct);
            }
            catch (Exception e) when (e is not OperationCanceledException)
            {
                _logger.LogError("Could not change blobs' tier in container {ContainerName} with prefix {VirtualFolderName}: {EMessage}", containerName, virtualFolderName, e.Message);
                errors.Add(e.Message);
            }
        }
        else
        {
            _logger.LogInformation("Changing tier for container {ContainerName}", containerName);
            try
            {
                await ChangeBlobsTierInBulkAsync(blobClient, containerName, null, containerClient, errors, ct);
            }
            catch (Exception e) when (e is not OperationCanceledException)
            {
                _logger.LogError("Could not process container \'{ContainerName}\': {EMessage}", containerName, e.Message);
                errors.Add(e.Message);
            }
        }

        await UpdateMetadataAsync(dataPartitionId, operationId, item.Id, errors, ct);
    }

    private async Task UpdateMetadataAsync(string dataPartitionId, string operationId, string datasetId, List<string> errors, CancellationToken ct)
    {
        if (errors.Count == 0)
        {
            _logger.LogInformation("No errors, will process metadata for {DatasetId}", datasetId);

            try
            {
                await _metadataTierUpdater.UpdateTier(dataPartitionId, datasetId, _tier.ToString());
                await _changeTierTasks.IncrementCountAsync(operationId, Constants.ChangeTierOperationStatus.COMPLETED_CNT, ct);
            }
            catch (Exception e) when (e is not OperationCanceledException)
            {
                _logger.LogError("Could not process metadata for {DatasetId}: {EMessage}", datasetId, e.Message);
                await _changeTierTasks.IncrementCountAsync(operationId, Constants.ChangeTierOperationStatus.FAILED_CNT, ct);
                _foundErrors = true;
            }
        }
        else
        {
            _foundErrors = true;
            var allErrors = string.Join(" ", errors);
            _logger.LogInformation("Will not update metadata for {DatasetId} due to {AllErrors}", datasetId, allErrors);
            await _changeTierTasks.IncrementCountAsync(operationId, Constants.ChangeTierOperationStatus.FAILED_CNT, ct);
        }
    }

    private async Task ChangeBlobsTierInBulkAsync(IBlobClient blobClient, string containerName, string? virtualFolderName, BlobContainerClient containerClient, List<string> errors, CancellationToken ct)
    {
        var batchBlock = CreateBatchForBlobsToChangeTier(blobClient, errors, out var processItems, ct);
        var blobs = virtualFolderName is not null ? containerClient.GetBlobsAsync(prefix: virtualFolderName + "/", cancellationToken: ct) : containerClient.GetBlobsAsync(cancellationToken: ct);

        await foreach (var pages in blobs.AsPages().WithCancellation(ct))
        {
            foreach (var blob in pages.Values)
            {
                _logger.LogDebug("Changing tier of blob: {BlobName}", blob.Name);
                _ = await batchBlock.SendAsync(new(containerName, blob.Name), ct);
            }
        }
        batchBlock.Complete();
        await processItems.Completion;
    }

    private BatchBlock<Tuple<string, string>> CreateBatchForBlobsToChangeTier(IBlobClient blobClient, List<string> errors, out ActionBlock<Tuple<string, string>[]> processItems, CancellationToken ct)
    {
        var blobBatchClient = blobClient.GetBatchClient();
        var _batchIndex = 0;
        var batchBlock = new BatchBlock<Tuple<string, string>>(Constants.BLOB_BULK_CHANGE_TIER_BATCH_SIZE);
        processItems = new(async x => await SubmitChangeTierBatch(blobBatchClient, errors, listOfBlobs: x, ref _batchIndex), new()
        {
            MaxDegreeOfParallelism = Environment.ProcessorCount,
            CancellationToken = ct,
        });
        _ = batchBlock.LinkTo(processItems, new() { PropagateCompletion = true });
        return batchBlock;
    }

    private Task SubmitChangeTierBatch(BlobBatchClient blobBatchClient, List<string> errors, Tuple<string, string>[] listOfBlobs, ref int counter)
    {
        var batchedBlobs = listOfBlobs.ToList();
        _ = Interlocked.Increment(ref counter);

        var task = SendBlobChangeTierBatchAsync(blobBatchClient, errors, batchedBlobs, counter);

        return task;
    }

    private async Task SendBlobChangeTierBatchAsync(BlobBatchClient blobBatchClient, ICollection<string> errors, List<Tuple<string, string>> blobs, int batchNr)
    {
        var blobBatch = blobBatchClient.CreateBatch();
        blobs.ForEach(x => blobBatch.SetBlobAccessTier(x.Item1, x.Item2, _tier));

        await blobBatchClient.SubmitBatchAsync(blobBatch)
            .ContinueWith(itemResponse =>
            {
                if (itemResponse.IsCompletedSuccessfully)
                {
                    return;
                }

                var innerExceptions = itemResponse.Exception?.Flatten();

                var message = innerExceptions?.InnerExceptions.FirstOrDefault();
                _logger.LogError("Exception: {e}", message);
                errors.Add($"Exception {message!.Message}");
            });

        _logger.LogInformation("Batch {BatchNr} completed successfully", batchNr);
    }
}
