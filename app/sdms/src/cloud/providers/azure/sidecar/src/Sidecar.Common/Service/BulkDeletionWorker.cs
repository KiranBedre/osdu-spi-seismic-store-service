using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;
using Azure.Storage.Blobs.Specialized;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json.Linq;
using Newtonsoft.Json;
using Sidecar.Common.Model;
using System.Threading.Tasks.Dataflow;
using System.Security;

namespace Sidecar.Common.Service
{
    public class BulkDeletionWorker: IBulkDeletionWorker<Model.IStorageAcountOptions>
    {
        private readonly int _batchSize = 100;

        private static ILogger<BulkDeletionWorker> _logger;
        protected readonly Model.IStorageAcountOptions Options;

        private int _deletedDatasetTotalCount = 0;
        private int _deletedDatasetInABatchCount = 0;
        private int _batchNr = 1;

        private readonly List<string> _errors = new();

        private readonly BlobServiceClient _client;

        public BulkDeletionWorker(IStorageAcountOptions options, ILogger<BulkDeletionWorker> logger)
        {
            _logger = logger;
            Options = options;
           
            var storageAccountConnectionString = options.StorageAccountConnectionString ?? throw new ArgumentNullException(options.StorageAccountConnectionString);
            _client = CreateClient(storageAccountConnectionString);

        }

        private BlobServiceClient CreateClient(string storageAccountConnectionString)
        {
            _logger!.LogInformation("Establishing Storage account connection ...");
            var clientOptions = new BlobClientOptions();
            var blobServiceClient = new BlobServiceClient(storageAccountConnectionString, clientOptions);
            return blobServiceClient;
        }



        public async Task RunBulkDeletion(List<Object> itemsToDelete)
        {
            _logger.LogInformation($"Started blob deletion, it will delete {itemsToDelete.Count} items");

            var batchBlock = CreateBatchForBlobsDeletion(out ActionBlock<Tuple<string, string>[]> importer);

            await Parallel.ForEachAsync(itemsToDelete,
                new ParallelOptions { MaxDegreeOfParallelism = Environment.ProcessorCount },
                async (item, ct) =>
                {
                    JObject jsonItem = JsonConvert.DeserializeObject<JObject>(item.ToString());
                    (string containerName, string? virtualFolderName) = ParseContainerAndFolderName(jsonItem);

                    var containerClient = _client.GetBlobContainerClient(containerName);

                    if (virtualFolderName is not null)
                    {
                        var blobs = containerClient.GetBlobsAsync(BlobTraits.None, BlobStates.None, prefix: virtualFolderName + "/");
                        _logger.LogDebug($"Deleting blobs in container {containerName} with prefix {virtualFolderName}");
                        await foreach (var pages in blobs.AsPages())
                        {
                            foreach (var blob in pages.Values)
                            {
                                _logger.LogDebug($"Deleting blob: {blob.Name}");
                                _ = await batchBlock.SendAsync(new Tuple<string, string>(containerName, blob.Name));
                            }
                        }
                    }
                    else
                    {
                        _logger.LogDebug($"Deleting container {containerName}");
                        try
                        {
                            _ = await containerClient.DeleteAsync();
                        }
                        catch (Azure.RequestFailedException e)
                        {
/*                            if (e.ErrorCode == "ContainerNotFound")
                            {
                                // we assume this was previously deleted and continue ignorint this exception
                                _logger.LogInformation($"Could not find container {containerName}. Ignoring as it is assumed to have already been deleted");
                            }
                            else*/
                            {
                                _logger.LogError($"Could not delete container {containerName}: {e.Message}");
                                _errors.Add(e.Message);
                            }
                        }
                    }

                    string datasetId = jsonItem["id"].ToString();
                    if (_errors.Count == 0)
                    {
                        _logger.LogInformation($"No errors, will delete metadata for {datasetId}");
                        //delete metadata

                    }
                    else
                    {
                        var allErrors = string.Join(" ", _errors);
                        _logger.LogInformation($"Will not delete metadata for {datasetId} due to {allErrors}");
                    }

                    _deletedDatasetTotalCount++;
                    _deletedDatasetInABatchCount++;
                    _logger.LogInformation($"Current progress: processed dataset total count / total dataset count -- {_deletedDatasetTotalCount} / {itemsToDelete.Count}");
                });

            batchBlock.Complete();
            await importer.Completion;
        }

        static (string containerName, string? virtualFolderName) ParseContainerAndFolderName(JObject jsonObject)
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

      
        private BatchBlock<Tuple<string, string>> CreateBatchForBlobsDeletion(out ActionBlock<Tuple<string, string>[]> importer)
        {
            var blobBatchClient = _client.GetBlobBatchClient();
            var batchBlock = new BatchBlock<Tuple<string, string>>(_batchSize);
            importer = new ActionBlock<Tuple<string, string>[]>(async x => await SubmitDeletionBatch(x, blobBatchClient), new ExecutionDataflowBlockOptions
            {
                MaxDegreeOfParallelism = Environment.ProcessorCount,
            });
            _ = batchBlock.LinkTo(importer, new DataflowLinkOptions { PropagateCompletion = true });
            return batchBlock;
        }

        private Task SubmitDeletionBatch(Tuple<string, string>[] listOfBlobs, BlobBatchClient blobBatchClient)
        {
            var deletedDatasetInABatchCount = _deletedDatasetInABatchCount;
            _logger.LogDebug($"Current batch start: dataset count: {deletedDatasetInABatchCount}, blob count: {listOfBlobs.Length}, batch max size: {_batchSize}");

            var batchedBlobs = new List<Tuple<string, string>>(listOfBlobs);

            var task = SendBlobDeleteBatch(_errors, blobBatchClient, batchedBlobs, _batchNr).ContinueWith(response =>
            {
                if (!response.IsCompletedSuccessfully)
                {
                    var innerExceptions = response.Exception?.Flatten();

                    var message = $"Exception:  {innerExceptions?.InnerExceptions.FirstOrDefault()}";
                    _logger.LogError(message);
                    _errors.Add(message);
                }
                else
                {
                    var result = response.Result;
                    var batchNumber = result;
                }

            });
            _batchNr++;
            _deletedDatasetInABatchCount = 0;
            return task;
        }

        private static async Task<int> SendBlobDeleteBatch(List<string> errors, BlobBatchClient blobBatchClient, List<Tuple<string, string>> blobs, int batchNr)
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
                        _logger.LogError(message);
                        errors.Add(message);
                    }
                    else
                    {
                        _logger.LogInformation($"Batch {blobBatch.ToString} in {batchNr} completed successfully");
                    }
                });

            return batchNr;
        }

    }
}
