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

namespace Sidecar.ComputeSizeRunner;

using Azure;
using Microsoft.Extensions.Logging;
using Sidecar.Common.Utility;

public class DatasetSizeRetriever(ILogger<DatasetSizeRetriever> logger, IBlobClientFactory blobClientFactory) : IDatasetSizeRetriever
{
    private readonly ILogger<DatasetSizeRetriever> _logger = logger;
    private readonly IBlobClientFactory _blobClientFactory = blobClientFactory;

    public async Task<long> RetrieveSize(IComputeSizeOperationMessage task, CancellationToken ct)
    {
        var blobClient = await _blobClientFactory.GetBlobClientAsync(task.Tenant, ct);

        string containerName;
        string? virtualFolderName;

        try
        {
            (containerName, virtualFolderName) = Utils.ParseContainerAndFolderPath(task.BlobsPath);
        }
        catch (ArgumentException e)
        {
            _logger.LogError("Could not parse blobs path {Path}: {EMessage}", task.BlobsPath, e.Message);
            throw;
        }

        var containerClient = blobClient.GetContainerClient(containerName);
        long size = 0;
        try
        {
            // Call the listing operation and return pages of the specified size.
            var blobPages = containerClient.GetBlobsAsync(prefix: virtualFolderName, cancellationToken: ct)
                .AsPages(default, 5000);

            // Enumerate the blobs returned for each page.
            await foreach (var blobPage in blobPages)
            {
                foreach (var blobItem in blobPage.Values)
                {
                    if (blobItem.Properties.ContentLength != null)
                    {
                        size += blobItem.Properties.ContentLength.Value;
                    }
                }
            }
        }
        catch (RequestFailedException)
        {
            _logger.LogError("Retrieving blob sizes failed for dataset {}, tenant {}, blobs path {}.", task.DatasetId, task.Tenant, task.BlobsPath);
            throw;
        }
        return size;
    }

}
