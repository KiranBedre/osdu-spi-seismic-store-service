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
using Newtonsoft.Json.Linq;
using Newtonsoft.Json;
using System.Threading.Tasks.Dataflow;

using Interface;

public class BulkDeletionWorker : IBulkDeletionWorker
{
    private readonly int _batchSize = 100;

    private readonly ILogger<BulkDeletionWorker> Logger;
    private readonly IQueueHandlerDeletion Queue;
    private readonly IMetadataDeletionWorker MetadataDeletionWorker;

    private int DeletedDatasetTotalCount = 0;
    private int DeletedDatasetInABatchCount = 0;
    private int BatchNr = 1;
    private string StorageAccountConnectionString;
    private readonly BlobServiceClient BlobStorageClient;

    public BulkDeletionWorker(IOptionsStorageAcount options,
        ILogger<BulkDeletionWorker> logger,
        IQueueHandlerDeletion queue,
        IMetadataDeletionWorker metadataDeletionWorker)
    {
        Logger = logger;
        Queue = queue;
        MetadataDeletionWorker = metadataDeletionWorker;
        StorageAccountConnectionString = options.StorageAccountConnectionString ?? throw new ArgumentNullException(options.StorageAccountConnectionString);
        BlobStorageClient = CreateClient(StorageAccountConnectionString);
    }

    private BlobServiceClient CreateClient(string storageAccountConnectionString)
    {
        Logger.LogInformation("Establishing Storage account connection ...");
        var clientOptions = new BlobClientOptions();
        var blobServiceClient = new BlobServiceClient(storageAccountConnectionString, clientOptions);
        return blobServiceClient;
    }

    public async Task RunBulkDeletion(string operationId, List<Object> itemsToDelete)
    {
        Logger.LogInformation($"Started blob deletion, it will delete {itemsToDelete.Count} items");

        await Parallel.ForEachAsync(itemsToDelete,
            new ParallelOptions { MaxDegreeOfParallelism = Environment.ProcessorCount },
            async (item, ct) => await processItemDeletion(operationId, item, ct, itemsToDelete.Count)
            );
    }

    private async Task processItemDeletion(string operationId, object item, CancellationToken cancellationToken, int totalCount)
    {
        JObject jsonItem = JsonConvert.DeserializeObject<JObject>(item.ToString());
        (string containerName, string? virtualFolderName) = ParseContainerAndFolderName(jsonItem);

        var containerClient = BlobStorageClient.GetBlobContainerClient(containerName);
        var errors = new List<string>();

        if (virtualFolderName is not null)
        {
            var batchBlock = CreateBatchForBlobsDeletion(BlobStorageClient, errors, out ActionBlock<Tuple<string, string>[]> importer);
            var blobs = containerClient.GetBlobsAsync(BlobTraits.None, BlobStates.None, prefix: virtualFolderName + "/");
            Logger.LogDebug($"Deleting blobs in container {containerName} with prefix {virtualFolderName}");
            await foreach (var pages in blobs.AsPages())
            {
                foreach (var blob in pages.Values)
                {
                    Logger.LogDebug($"Deleting blob: {blob.Name}");
                    _ = await batchBlock.SendAsync(new Tuple<string, string>(containerName, blob.Name));
                }
            }
            batchBlock.Complete();
            await importer.Completion;
        }
        else
        {
            Logger.LogDebug($"Deleting container {containerName}");
            try
            {
                _ = await containerClient.DeleteAsync();
            }
            catch (Azure.RequestFailedException e)
            {
                if (e.ErrorCode == "ContainerNotFound")
                {
                    // we assume this was previously deleted and continue ignoring this exception
                    Logger.LogInformation($"Could not find container {containerName}. Ignoring as it is assumed to have already been deleted");
                }
                else
                {
                    Logger.LogError($"Could not delete container {containerName}: {e.Message}");
                    errors.Add(e.Message);
                }
            }
        }

        // removing the metadata
        string datasetId = jsonItem["id"].ToString();
        if (errors.Count == 0)
        {
            Logger.LogInformation($"No errors, will delete metadata for {datasetId}");

            try
            {
                await MetadataDeletionWorker.DeleteMetadata(datasetId);
            }
            catch (Exception e)
            {
                Logger.LogError($"Could not delete metadata for {datasetId}: {e.Message}");

            }
            await Queue.IncrementCountAsync(operationId, "DeletedCnt");
        }
        else
        {
            var allErrors = string.Join(" ", errors);
            Logger.LogInformation($"Will not delete metadata for {datasetId} due to {allErrors}");
            await Queue.IncrementCountAsync(operationId, "FailedCnt");
        }

        Interlocked.Increment(ref DeletedDatasetTotalCount);
        Interlocked.Increment(ref DeletedDatasetInABatchCount);
        Logger.LogInformation($"Current progress: processed dataset total count / total dataset count -- {DeletedDatasetTotalCount} / {totalCount}");

    }

    private static (string containerName, string? virtualFolderName) ParseContainerAndFolderName(JObject jsonObject)
    {
        string datasetGcsUrl = jsonObject["gcsurl"].ToString();
        string[] parts = datasetGcsUrl.Split('/');

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
            throw new ArgumentException($"Invalid input format for $jsonObject. Could not extract gcsurl in the format <container>/<folder name> ");
        }
    }

    private BatchBlock<Tuple<string, string>> CreateBatchForBlobsDeletion(BlobServiceClient client, List<string> errors, out ActionBlock<Tuple<string, string>[]> importer)
    {
        var blobBatchClient = client.GetBlobBatchClient();
        var batchBlock = new BatchBlock<Tuple<string, string>>(_batchSize);
        importer = new ActionBlock<Tuple<string, string>[]>(async x => await SubmitDeletionBatch(blobBatchClient, errors, listOfBlobs: x), new ExecutionDataflowBlockOptions
        {
            MaxDegreeOfParallelism = Environment.ProcessorCount,
        });
        _ = batchBlock.LinkTo(importer, new DataflowLinkOptions { PropagateCompletion = true });
        return batchBlock;
    }

    private Task SubmitDeletionBatch(BlobBatchClient blobBatchClient,
                                        List<string> errors,
                                        Tuple<string, string>[] listOfBlobs)
    {
        var deletedDatasetInABatchCount = DeletedDatasetInABatchCount;
        Logger.LogDebug($"Current batch start: dataset count: {deletedDatasetInABatchCount}, blob count: {listOfBlobs.Length}, batch max size: {_batchSize}");

        var batchedBlobs = new List<Tuple<string, string>>(listOfBlobs);

        var task = SendBlobDeleteBatch(blobBatchClient, errors, batchedBlobs, BatchNr).ContinueWith(response =>
        {
            if (!response.IsCompletedSuccessfully)
            {
                var innerExceptions = response.Exception?.Flatten();

                var message = $"Exception:  {innerExceptions?.InnerExceptions.FirstOrDefault()}";
                Logger.LogError(message);
                errors.Add(message);
            }
        });
        BatchNr++;
        DeletedDatasetInABatchCount = 0;
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
                else
                {
                    Logger.LogDebug($"Batch {batchNr} completed successfully");
                }
            });

        return batchNr;
    }
}
