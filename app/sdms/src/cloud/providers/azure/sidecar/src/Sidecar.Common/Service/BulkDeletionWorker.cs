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
using Azure.Storage.Blobs.Models;
using Azure.Storage.Blobs.Specialized;
using Microsoft.Extensions.Logging;
using System.Threading.Tasks.Dataflow;

using Interface;
using Sidecar.Common.Model;

public class BulkDeletionWorker : IBulkDeletionWorker
{
    private readonly int _batchSize = 1000;

    private readonly ILogger<BulkDeletionWorker> Logger;
    private readonly IQueueHandlerDeletion Queue;
    private readonly IMetadataDeletionWorker MetadataDeletionWorker;
    private readonly IBlobClientFactory _blobClientFactory;
    private int BatchIndex = 0;
    private bool FoundErrors  = false;

    public BulkDeletionWorker(ILogger<BulkDeletionWorker> logger,
        IQueueHandlerDeletion queue,
        IMetadataDeletionWorker metadataDeletionWorker,
        IBlobClientFactory blobClientFactory)
    {
        Logger = logger;
        Queue = queue;
        MetadataDeletionWorker = metadataDeletionWorker;
        _blobClientFactory = blobClientFactory;
    }

    public async Task RunBulkDeletion(string dataPartitionId, string operationId, List<DeleteItem> itemsToDelete, CancellationToken ct)
    {
        var blobClient = await _blobClientFactory.GetBlobClient(dataPartitionId, ct);

        FoundErrors = false;

        Logger.LogInformation($"Started blob deletion, it will delete {itemsToDelete.Count} items");
        await Queue.UpdateFieldStatusOperation(operationId, "Status", Status.InProgress.ToString());
        await Queue.UpdateFieldStatusOperation(operationId, "StatusDescription", Status.InProgress.Description());

        await Parallel.ForEachAsync(itemsToDelete,
            new ParallelOptions { MaxDegreeOfParallelism = Environment.ProcessorCount, CancellationToken = ct },
            async (item, innerCt) => await processItemDeletion(dataPartitionId, blobClient, operationId, item, innerCt)
            );

        if (FoundErrors)
        {
            await Queue.UpdateFieldStatusOperation(operationId, "Status", Status.CompletedWithErrors.ToString());
            await Queue.UpdateFieldStatusOperation(operationId, "StatusDescription", Status.CompletedWithErrors.Description());
            Logger.LogInformation($"Finished deletion operation {operationId} with errors");
        }
        else
        {
            await Queue.UpdateFieldStatusOperation(operationId, "Status", Status.Completed.ToString());
            await Queue.UpdateFieldStatusOperation(operationId, "StatusDescription", Status.Completed.Description());
            Logger.LogInformation($"Finished deletion operation {operationId} successfully");
        }

    }

    private async Task processItemDeletion(string dataPartitionId, IBlobClient blobClient, string operationId, DeleteItem item, CancellationToken cancellationToken)
    {
        if (item.Gcsurl is null)
        {
            Logger.LogError($"Gcsurl is null for item {item.Id}");
            FoundErrors = true;
            await Queue.IncrementCountAsync(operationId, "FailedCnt");
            return;
        }

        string containerName;
        string? virtualFolderName;

        try
        {
            (containerName, virtualFolderName) = ParseContainerAndFolderName(item.Gcsurl);
        }
        catch (ArgumentException e)
        {
            Logger.LogError($"Could not parse gcsurl {item.Gcsurl}: {e.Message}");
            FoundErrors = true;
            await Queue.IncrementCountAsync(operationId, "FailedCnt");
            return;
        }

        var containerClient = blobClient.GetContainerClient(containerName);

        var errors = new List<string>();
        if (virtualFolderName is not null)
        {
            Logger.LogInformation($"Deleting blobs in container {containerName} with prefix {virtualFolderName}");

            await DeleteBlobsInBulk(blobClient, containerName, virtualFolderName, containerClient, errors);
        }
        else
        {
            Logger.LogInformation($"Deleting container {containerName}");
            try
            {
                _ = await containerClient.DeleteAsync();
            }
            catch (Azure.RequestFailedException e)
            {
                if (e.ErrorCode == "ContainerNotFound")
                {
                    // we assume this was previously deleted and continue ignoring this exception
                    Logger.LogInformation("Could not find container \'{ContainerName}\'. Ignoring as it is assumed to have already been deleted", containerName);
                }
                else
                {
                    Logger.LogError("Could not delete container \'{ContainerName}\': {EMessage}", containerName, e.Message);
                    errors.Add(e.Message);
                }
            }
        }

        // removing the metadata
        await RemoveMetadata(dataPartitionId, operationId, item.Id, errors);
    }

    private async Task RemoveMetadata(string dataPartitionId, string operationId, string datasetId, List<string> errors)
    {
        if (errors.Count == 0)
        {
            Logger.LogInformation($"No errors, will delete metadata for {datasetId}");

            try
            {
                await MetadataDeletionWorker.DeleteMetadata(dataPartitionId, datasetId);
            }
            catch (Exception e)
            {
                Logger.LogError($"Could not delete metadata for {datasetId}: {e.Message}");

            }
            await Queue.IncrementCountAsync(operationId, "DeletedCnt");
        }
        else
        {
            FoundErrors = true;
            var allErrors = string.Join(" ", errors);
            Logger.LogInformation($"Will not delete metadata for {datasetId} due to {allErrors}");
            await Queue.IncrementCountAsync(operationId, "FailedCnt");
        }
    }

    public static (string containerName, string? virtualFolderName) ParseContainerAndFolderName(string gcsurl)
    {
        string[] parts = gcsurl.Split('/');

        if (parts.Length == 1)
        {
            return (parts[0], null);
        }
        else if (parts.Length == 2)
        {
            return (parts[0], parts[1]);
        }
        else
        {
            throw new ArgumentException($"Invalid item: {gcsurl} Could not extract gcsurl in the format <container>/<folder name> ");
        }
    }

    private async Task DeleteBlobsInBulk(IBlobClient blobClient, string containerName, string? virtualFolderName, BlobContainerClient containerClient, List<string> errors)
    {
        BatchIndex = 0;
        var batchBlock = CreateBatchForBlobsDeletion(blobClient, errors, out ActionBlock<Tuple<string, string>[]> processItems);
        var blobs = containerClient.GetBlobsAsync(BlobTraits.None, BlobStates.None, prefix: virtualFolderName + "/");

        await foreach (var pages in blobs.AsPages())
        {
            foreach (var blob in pages.Values)
            {
                Logger.LogInformation($"Deleting blob: {blob.Name}");
                _ = await batchBlock.SendAsync(new Tuple<string, string>(containerName, blob.Name));
            }
        }
        batchBlock.Complete();
        await processItems.Completion;
    }

    private BatchBlock<Tuple<string, string>> CreateBatchForBlobsDeletion(IBlobClient blobClient, List<string> errors, out ActionBlock<Tuple<string, string>[]> processItems)
    {
        var blobBatchClient = blobClient.GetBatchClient();
        var batchBlock = new BatchBlock<Tuple<string, string>>(_batchSize);
        processItems = new ActionBlock<Tuple<string, string>[]>(async x => await SubmitDeletionBatch(blobBatchClient, errors, listOfBlobs: x), new ExecutionDataflowBlockOptions
        {
            MaxDegreeOfParallelism = Environment.ProcessorCount,
        });
        _ = batchBlock.LinkTo(processItems, new DataflowLinkOptions { PropagateCompletion = true });
        return batchBlock;
    }

    private Task SubmitDeletionBatch(BlobBatchClient blobBatchClient,
                                        List<string> errors,
                                        Tuple<string, string>[] listOfBlobs)
    {
        var batchedBlobs = new List<Tuple<string, string>>(listOfBlobs);
        _ = Interlocked.Increment(ref BatchIndex);

        var task = SendBlobDeleteBatch(blobBatchClient, errors, batchedBlobs, BatchIndex);
        
        return task;
    }

    private async Task<int> SendBlobDeleteBatch(BlobBatchClient blobBatchClient, List<string> errors, List<Tuple<string, string>> blobs, int batchNr)
    {
        var blobBatch = blobBatchClient.CreateBatch();
        blobs.ForEach(x => blobBatch.DeleteBlob(x.Item1, x.Item2));

        await blobBatchClient.SubmitBatchAsync(blobBatch)
            .ContinueWith(itemResponse =>
            {
                if (!itemResponse.IsCompletedSuccessfully)
                {
                    var innerExceptions = itemResponse.Exception?.Flatten();

                    var message = $"Exception:  {innerExceptions?.InnerExceptions.FirstOrDefault()}";
                    Logger.LogError(message);
                    errors.Add(message);
                }
            });

        Logger.LogInformation($"Batch {batchNr} completed successfully");
        return batchNr;
    }
}
