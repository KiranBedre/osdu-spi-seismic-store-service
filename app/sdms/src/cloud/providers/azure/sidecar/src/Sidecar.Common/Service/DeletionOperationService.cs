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
    private const int MAX_CONSECUTIVE_FAILURES = 10;
    private const int LOCK_ATTEMPTS = 5;

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
                _logger.LogError(ex, "Error {m} while processing deletion operation.", _consecutiveFailures / MAX_CONSECUTIVE_FAILURES);
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
            await Task.Delay(1000, cancellationToken);
            return;
        }

        //---start the deletion process
        _logger.LogInformation("Starting deletion operation {op}...", op.OperationId);
        var deletionErrors = true;
        var lockErrors = true;
        var successfullyLocked = new List<DeleteItem>();

        bool unlockErrors;
        try
        {
            var itemsToDelete = await _itemsRetriever.GetItemsAsync(op.Tenant, op.Subproject, op.Path, cancellationToken);

            _logger.LogInformation("Found {c} items to delete",
                itemsToDelete!.Count.ToString(CultureInfo.InvariantCulture));

            await _deletionTasks.UpdateFieldStatusOperationAsync(
                op.OperationId,
                Constants.DeleteOperationStatus.DATASETS_CNT,
                itemsToDelete.Count.ToString());

            lockErrors = await LockDatasetsAsync(op, itemsToDelete, successfullyLocked);
            deletionErrors = await _bulkDeletionWorker.RunBulkDeletionAsync(op.Tenant, op.OperationId, successfullyLocked, cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error while deleting datasets {ex} ", ex.ToString());
        }
        finally
        {
            unlockErrors = await UnlockDatasetsAsync(op, successfullyLocked);
        }


        if (lockErrors || deletionErrors || unlockErrors)
        {
            await UpdateOperationStatusAsync(op.OperationId, Status.CompletedWithErrors);
            _logger.LogError("Finished deletion operation {op} with errors", op.OperationId);
        }
        else
        {
            await UpdateOperationStatusAsync(op.OperationId, Status.Completed);
            _logger.LogInformation("Finished deletion operation {op} successfully", op.OperationId);
        }
    }

    private async Task UpdateOperationStatusAsync(string operationId, Status status)
    {
        await _deletionTasks.UpdateFieldStatusOperationAsync(operationId, Constants.DeleteOperationStatus.STATUS, status.ToString());
        await _deletionTasks.UpdateFieldStatusOperationAsync(operationId, Constants.DeleteOperationStatus.STATUS_DESCRIPTION, status.Description());
    }

    private async Task<bool> UnlockDatasetsAsync(IDeleteOperationStatus op, List<DeleteItem> itemsToUnlock)
    {
        var unlockErrors = false;
        foreach (var item in itemsToUnlock)
        {
            var datasetName = GetDatasetName(item);
            var lockKey = op.Tenant + "/" + op.Subproject + datasetName;
            _logger.LogDebug("Removing lock for {n}", lockKey);
            var unlocked = false;
            var attempt = 0;

            while (!unlocked && attempt < LOCK_ATTEMPTS)
            {
                unlocked = await _lockManager.RemoveDeleteLockAsync(lockKey);
                if (!unlocked)
                {
                    _logger.LogError("Could not remove lock for {n} (Attempt {attempt})", lockKey, attempt + 1);
                    await Task.Delay(100);
                }
                attempt++;
            }

            if (!unlocked)
            {
                unlockErrors = true;
            }
        }

        return unlockErrors;
    }


    private async Task<bool> LockDatasetsAsync(IDeleteOperationStatus op, List<DeleteItem> itemsToDelete, List<DeleteItem> successfullyLocked)
    {
        var foundLockErrors = false;

        foreach (var item in itemsToDelete)
        {
            var datasetName = GetDatasetName(item);
            var lockKey = op.Tenant + "/" + op.Subproject + datasetName;
            _logger.LogDebug("Acquiring lock for {n}", lockKey);

            var locked = false;
            var attempt = 0;

            while (!locked && attempt < LOCK_ATTEMPTS)
            {
                locked = await _lockManager.AcquireDeleteLockAsync(lockKey);
                if (!locked)
                {
                    _logger.LogError("Could not acquire lock for {n} (Attempt {attempt})", lockKey, attempt + 1);
                    await Task.Delay(100);
                }
                attempt++;
            }

            if (locked)
            {
                successfullyLocked.Add(item);
            }
            else
            {
                await _deletionTasks.IncrementCountAsync(op.OperationId, Constants.DeleteOperationStatus.FAILED_CNT);
                foundLockErrors = true;
            }
        }

        return foundLockErrors;
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
