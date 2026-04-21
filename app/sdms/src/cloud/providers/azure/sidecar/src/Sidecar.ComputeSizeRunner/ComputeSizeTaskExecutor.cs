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

using Microsoft.Extensions.Logging;

public class ComputeSizeTaskExecutor(ILogger<ComputeSizeTaskExecutor> logger, IDatasetSizeRetriever datasetSizeRetriever, IMetadataUpdater metadataUpdater, IDatasetWriteLockManager lockManager) : ITaskExecutor<IComputeSizeOperationMessage>
{

    private readonly ILogger<ComputeSizeTaskExecutor> _logger = logger;
    private readonly IDatasetSizeRetriever _datasetSizeRetriever = datasetSizeRetriever;
    private readonly IMetadataUpdater _metadataUpdater = metadataUpdater;
    private readonly IDatasetWriteLockManager _lockManager = lockManager;

    public async Task ProcessAsync(IComputeSizeOperationMessage task, CancellationToken ct)
    {
        _logger.LogInformation("Starting compute size operation {op}...", task.OperationId);
        var size = await _datasetSizeRetriever.RetrieveSize(task, ct);

        if (size == task.DatasetSize)
        {
            _logger.LogInformation("Size of dataset {DatasetId} didn't change. Skipping update.", task.DatasetId);
            return;
        }

        var datasetFullName = task.Tenant + "/" + task.Subproject + task.Path + task.Name;
        var writeLockSession = await _lockManager.LockDataset(datasetFullName);

        // Update it successfully locked, message is not put back on the queue if locking didn't work
        if (writeLockSession.Locked)
        {
            _logger.LogInformation("Updating metadata for dataset {id}...", task.DatasetId);
            await _metadataUpdater.UpdateComputeSize(task.Tenant, task.DatasetId, size, ct);
            await _lockManager.ReleaseLock(datasetFullName, writeLockSession);
        }
    }

}
