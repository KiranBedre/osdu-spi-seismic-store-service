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

public class BulkDeletionWorker : IBulkDeletionWorker
{
    private readonly ILogger<BulkDeletionWorker> _logger;
    private readonly IDeletionTaskStatusStorage _deletionTasks;
    private readonly IMetadataDeletionWorker _metadataDeletionWorker;
    private readonly IBlobClientFactory _blobClientFactory;
    private bool _foundErrors = false;

    public BulkDeletionWorker(
        ILogger<BulkDeletionWorker> logger,
        IDeletionTaskStatusStorage deletionTasks,
        IMetadataDeletionWorker metadataDeletionWorker,
        IBlobClientFactory blobClientFactory)
    {
        _logger = logger;
        _deletionTasks = deletionTasks;
        _metadataDeletionWorker = metadataDeletionWorker;
        _blobClientFactory = blobClientFactory;
    }

    public async Task<bool> RunBulkDeletionAsync(string dataPartitionId, string operationId, List<DeleteItem> itemsToDelete, bool deletionErrors, CancellationToken ct)
    {
        var blobClient = await _blobClientFactory.GetBlobClientAsync(dataPartitionId, ct);

        _foundErrors = false;

        _logger.LogInformation("Started blob deletion, it will delete {Count} items", itemsToDelete.Count);
        await _deletionTasks.UpdateFieldStatusOperationAsync(operationId, Constants.DeleteOperationStatus.STATUS, Status.InProgress.ToString(), ct);
        await _deletionTasks.UpdateFieldStatusOperationAsync(operationId, Constants.DeleteOperationStatus.STATUS_DESCRIPTION, Status.InProgress.Description(), ct);

        await Parallel.ForEachAsync(itemsToDelete,
            new ParallelOptions { MaxDegreeOfParallelism = Environment.ProcessorCount, CancellationToken = ct },
            async (item, innerCt) => await ProcessItemDeletionAsync(dataPartitionId, blobClient, operationId, item, innerCt)
            );

        // if error was found in previous iteration
        if (deletionErrors)
        {
            return true;
        }

        return _foundErrors;
    }

    private async Task ProcessItemDeletionAsync(string dataPartitionId, IBlobClient blobClient, string operationId, DeleteItem item, CancellationToken ct)
    {
        if (item.Gcsurl is null)
        {
            _logger.LogError("Gcsurl is null for item {ItemId}", item.Id);
            _foundErrors = true;
            await _deletionTasks.IncrementCountAsync(operationId, Constants.DeleteOperationStatus.FAILED_CNT, ct);
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
            await _deletionTasks.IncrementCountAsync(operationId, Constants.DeleteOperationStatus.FAILED_CNT, ct);
            return;
        }

        var containerClient = blobClient.GetContainerClient(containerName);

        var errors = new List<string>();
        if (virtualFolderName is not null)
        {
            _logger.LogInformation("Deleting blobs in container {ContainerName} with prefix {VirtualFolderName}", containerName, virtualFolderName);
            try
            {
                await DeleteBlobsInBulkAsync(blobClient, containerName, virtualFolderName, containerClient, errors, ct);
            }
            catch (Exception e) when (e is not OperationCanceledException)
            {
                _logger.LogError("Could not delete blobs in container {ContainerName} with prefix {VirtualFolderName}: {EMessage}", containerName, virtualFolderName, e.Message);
                errors.Add(e.Message);
            }
        }
        else
        {
            _logger.LogInformation("Deleting container {ContainerName}", containerName);
            try
            {
                _ = await containerClient.DeleteAsync(cancellationToken: ct);
            }
            catch (Azure.RequestFailedException e)
            {
                if (e.ErrorCode == "ContainerNotFound")
                {
                    // we assume this was previously deleted and continue ignoring this exception
                    _logger.LogWarning("Could not find container \'{ContainerName}\'. Ignoring as it is assumed to have already been deleted", containerName);
                }
                else
                {
                    _logger.LogError("Could not delete container \'{ContainerName}\': {EMessage}", containerName, e.Message);
                    errors.Add(e.Message);
                }
            }
            catch (Exception e) when (e is not OperationCanceledException)
            {
                _logger.LogError("Could not delete container \'{ContainerName}\': {EMessage}", containerName, e.Message);
                errors.Add(e.Message);
            }
        }

        await RemoveMetadataAsync(dataPartitionId, operationId, item.Id, errors, ct);
    }

    private async Task RemoveMetadataAsync(string dataPartitionId, string operationId, string datasetId, List<string> errors, CancellationToken ct)
    {
        if (errors.Count == 0)
        {
            _logger.LogInformation("No errors, will delete metadata for {DatasetId}", datasetId);

            try
            {
                await _metadataDeletionWorker.DeleteMetadataAsync(dataPartitionId, datasetId);
                await _deletionTasks.IncrementCountAsync(operationId, Constants.DeleteOperationStatus.COMPLETED_CNT, ct);
            }
            catch (Exception e) when (e is not OperationCanceledException)
            {
                _logger.LogError("Could not delete metadata for {DatasetId}: {EMessage}", datasetId, e.Message);
                await _deletionTasks.IncrementCountAsync(operationId, Constants.DeleteOperationStatus.FAILED_CNT, ct);
                _foundErrors = true;
            }
        }
        else
        {
            _foundErrors = true;
            var allErrors = string.Join(" ", errors);
            _logger.LogInformation("Will not delete metadata for {DatasetId} due to {AllErrors}", datasetId, allErrors);
            await _deletionTasks.IncrementCountAsync(operationId, Constants.DeleteOperationStatus.FAILED_CNT, ct);
        }
    }

    private async Task DeleteBlobsInBulkAsync(IBlobClient blobClient, string containerName, string? virtualFolderName, BlobContainerClient containerClient, List<string> errors, CancellationToken ct)
    {
        var batchBlock = CreateBatchForBlobsDeletion(blobClient, errors, out var processItems, ct);
        var blobs = containerClient.GetBlobsAsync(prefix: virtualFolderName + "/", cancellationToken: ct);

        await foreach (var pages in blobs.AsPages().WithCancellation(ct))
        {
            foreach (var blob in pages.Values)
            {
                _logger.LogDebug("Deleting blob: {BlobName}", blob.Name);
                _ = await batchBlock.SendAsync(new(containerName, blob.Name), ct);
            }
        }
        batchBlock.Complete();
        await processItems.Completion;
    }

    private BatchBlock<Tuple<string, string>> CreateBatchForBlobsDeletion(IBlobClient blobClient, List<string> errors, out ActionBlock<Tuple<string, string>[]> processItems, CancellationToken ct)
    {
        var blobBatchClient = blobClient.GetBatchClient();
        var _batchIndex = 0;
        var batchBlock = new BatchBlock<Tuple<string, string>>(Constants.BLOB_BULK_DELETE_BATCH_SIZE);
        processItems = new(async x => await SubmitDeletionBatch(blobBatchClient, errors, listOfBlobs: x, ref _batchIndex), new()
        {
            MaxDegreeOfParallelism = Environment.ProcessorCount,
            CancellationToken = ct,
        });
        _ = batchBlock.LinkTo(processItems, new() { PropagateCompletion = true });
        return batchBlock;
    }

    private Task SubmitDeletionBatch(BlobBatchClient blobBatchClient,
                                        List<string> errors,
                                        Tuple<string, string>[] listOfBlobs,
                                        ref int counter)
    {
        var batchedBlobs = listOfBlobs.ToList();
        _ = Interlocked.Increment(ref counter);

        var task = SendBlobDeleteBatchAsync(blobBatchClient, errors, batchedBlobs, counter);

        return task;
    }

    private async Task SendBlobDeleteBatchAsync(BlobBatchClient blobBatchClient, ICollection<string> errors, List<Tuple<string, string>> blobs, int batchNr)
    {
        var blobBatch = blobBatchClient.CreateBatch();
        blobs.ForEach(x => blobBatch.DeleteBlob(x.Item1, x.Item2));

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
