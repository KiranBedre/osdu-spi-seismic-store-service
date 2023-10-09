namespace Sidecar.Common.TaskQueue;

using Microsoft.Extensions.Logging;
using Newtonsoft.Json;
using Sidecar.Common.Interface;
using Sidecar.Common.Model;
using Sidecar.Common.Utility;
using System.Globalization;

public class DeletionTaskExecutor: ITaskExecutor<string>
{
    private readonly ILogger<DeletionTaskExecutor> _logger;
    private readonly IDeletionTaskStatusStorage _deletionTaskStatusStorage;
    private readonly IItemsRetriever _itemsRetriever;
    private readonly IBulkDeletionWorker _bulkDeletionWorker;
    private readonly ILockManager _lockManager;

    private const int LOCK_ATTEMPTS = 5;

    public DeletionTaskExecutor(
        ILogger<DeletionTaskExecutor> logger,
        IDeletionTaskStatusStorage deletionTaskStatusStorage,
        IItemsRetriever itemsRetriever,
        IBulkDeletionWorker bulkDeletionWorker,
        ILockManager lockManager)
    {
        _logger = logger;
        _deletionTaskStatusStorage = deletionTaskStatusStorage;
        _itemsRetriever = itemsRetriever;
        _bulkDeletionWorker = bulkDeletionWorker;
        _lockManager = lockManager;
    }

    public async Task Process(string message, CancellationToken cancellationToken)
    {
        var op = JsonConvert.DeserializeObject<DeleteOperationMessage>(message);

        //---start the deletion process
        _logger.LogInformation("Starting deletion operation {op}...", op.OperationId);
        var status = await _deletionTaskStatusStorage.CreateDeletionOperationStatusAsync(op);

        var deletionErrors = true;
        var lockErrors = true;
        var successfullyLocked = new List<DeleteItem>();

        bool unlockErrors;
        try
        {
            var itemsToDelete = await _itemsRetriever.GetItemsAsync(op.Tenant, op.Subproject, op.Path, cancellationToken);

            _logger.LogInformation("Found {c} items to delete",
                itemsToDelete!.Count.ToString(CultureInfo.InvariantCulture));

            await _deletionTaskStatusStorage.UpdateFieldStatusOperationAsync(
                op.OperationId,
                Constants.DeleteOperationStatus.DATASETS_CNT,
                itemsToDelete.Count.ToString());

            lockErrors = await LockDatasetsAsync(status, itemsToDelete, successfullyLocked);
            deletionErrors = await _bulkDeletionWorker.RunBulkDeletionAsync(op.Tenant, op.OperationId, successfullyLocked, cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error while deleting datasets {ex} ", ex.ToString());
        }
        finally
        {
            unlockErrors = await UnlockDatasetsAsync(status, successfullyLocked);
        }

        if (lockErrors || deletionErrors || unlockErrors)
        {
            await UpdateStatusAndDeleteOperationAsync(op.OperationId, Status.CompletedWithErrors);
            _logger.LogError("Finished deletion operation {op} with errors", op.OperationId);
        }
        else
        {
            await UpdateStatusAndDeleteOperationAsync(op.OperationId, Status.Completed);
            _logger.LogInformation("Finished deletion operation {op} successfully", op.OperationId);
        }
    }

    private async Task UpdateStatusAndDeleteOperationAsync(string operationId, Status status)
    {
        await _deletionTaskStatusStorage.UpdateFieldStatusOperationAsync(operationId, Constants.DeleteOperationStatus.STATUS, status.ToString());
        await _deletionTaskStatusStorage.UpdateFieldStatusOperationAsync(operationId, Constants.DeleteOperationStatus.STATUS_DESCRIPTION, status.Description());
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
                await _deletionTaskStatusStorage.IncrementCountAsync(op.OperationId, Constants.DeleteOperationStatus.FAILED_CNT);
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
