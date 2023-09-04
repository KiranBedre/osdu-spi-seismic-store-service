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

using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using System.Globalization;

using Interface;
using Sidecar.Common.Model;
using Sidecar.Common.Utility;

public class DeletionOperationService : BackgroundService
{
    private readonly ILogger<DeletionOperationService> _logger;
    private readonly IDeletionTasksStorage _deletionTasks;
    private readonly IItemsRetriever _itemsRetriever;
    private readonly IBulkDeletionWorker _bulkDeletionWorker;
    private readonly ILockManager _lockManager;

    private int _consecutiveFailures = 0;
    private const int MAX_CONSECUTIVE_FAILURES = 1000000;

    public DeletionOperationService(ILogger<DeletionOperationService> logger,
        IDeletionTasksStorage deletionTasks,
        IItemsRetriever itemsRetriever,
        IBulkDeletionWorker bulkDeletionWorker,
        ILockManager lockManager)
    {
        _logger = logger;
        _deletionTasks = deletionTasks;
        _itemsRetriever = itemsRetriever;
        _bulkDeletionWorker = bulkDeletionWorker;
        _lockManager = lockManager;
    }

    protected override async Task ExecuteAsync(CancellationToken cancellationToken)
    {
        while (!cancellationToken.IsCancellationRequested && _consecutiveFailures < MAX_CONSECUTIVE_FAILURES)
        {
            try
            {
                await TryFetchAndExecuteTaskAsync(cancellationToken);
                _consecutiveFailures = 0;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, $"Error {ex.Message} while processing deletion operation: {_consecutiveFailures}/{MAX_CONSECUTIVE_FAILURES}");
                _consecutiveFailures++;
            }

            await Task.Delay(1000, cancellationToken);
        }
    }

    private async Task TryFetchAndExecuteTaskAsync(CancellationToken cancellationToken)
    {
        var op = await _deletionTasks.CheckForDeletionOperationAsync();
        if (op is null)
        {
            return;
        }

        //---start the deletion process
        _logger.LogInformation("Starting deletion operation {0}...", op.OperationId);

        var itemsToDelete = await _itemsRetriever.GetItemsAsync(op.Tenant, op.Subproject, op.Path, cancellationToken);

        _logger.LogInformation("Found {0} items to delete",
            itemsToDelete!.Count.ToString(CultureInfo.InvariantCulture));

        await _deletionTasks.UpdateFieldStatusOperationAsync(
            op.OperationId,
            Constants.DeleteOperationStatus.DATASETS_CNT,
            itemsToDelete.Count.ToString());

        var successfullyLocked = new List<DeleteItem>();

        foreach (var item in itemsToDelete)
        {
            var datasetName = GetDatasetName(item);
            _logger.LogDebug("Acquiring lock for {0}", datasetName);
            var lockKey = op.Tenant + "/" + op.Subproject + datasetName;
            var locked = await _lockManager.AcquireDeleteLockAsync(lockKey);
            if (locked)
            {
                successfullyLocked.Add(item);
            }
            else
            {
                _logger.LogInformation("Could not acquire lock for {0}", datasetName);
                await _deletionTasks.IncrementCountAsync(op.OperationId, Constants.DeleteOperationStatus.FAILED_CNT);
            }
        }

        await _bulkDeletionWorker.RunBulkDeletionAsync(op.Tenant, op.OperationId, successfullyLocked, cancellationToken);
    }

    private static string GetDatasetName(DeleteItem item)
    {
        if (item.Path.EndsWith("/"))
        {
            return item.Path + item.Name;
        }

        return item.Path + "/" + item.Name;
    }
}
