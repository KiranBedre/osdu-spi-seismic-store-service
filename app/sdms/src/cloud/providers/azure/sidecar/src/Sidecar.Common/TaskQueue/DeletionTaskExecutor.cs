namespace Sidecar.Common.TaskQueue;

using Microsoft.Extensions.Logging;
using Sidecar.Common.Interface;
using Sidecar.Common.Model;
using Sidecar.Common.Utility;
using System.Globalization;

public class DeletionTaskExecutor(
    ILogger<DeletionTaskExecutor> logger,
    IDeletionTaskStatusStorage deletionTaskStatusStorage,
    IDeletionItemsRetriever itemsRetriever,
    IBulkDeletionWorker bulkDeletionWorker,
    ILockManager lockManager) : ITaskExecutor<IDeletionOperationMessage>
{
    private readonly ILogger<DeletionTaskExecutor> _logger = logger;
    private readonly IDeletionTaskStatusStorage _deletionTaskStatusStorage = deletionTaskStatusStorage;
    private readonly IDeletionItemsRetriever _itemsRetriever = itemsRetriever;
    private readonly IBulkDeletionWorker _bulkDeletionWorker = bulkDeletionWorker;
    private readonly ILockManager _lockManager = lockManager;

    private const int LOCK_ATTEMPTS = 5;

    public async Task ProcessAsync(IDeletionOperationMessage op, CancellationToken ct)
    {
        //---start the deletion process
        _logger.LogInformation("Starting deletion operation {op}...", op.OperationId);
        var status = await _deletionTaskStatusStorage.CreateDeletionOperationStatusAsync(op, ct);

        var deletionErrors = false;
        var lockErrors = false;
        var successfullyLocked = new List<DeleteItem>();
        string? continuationToken = null;
        var pageCounter = 1; // page counter
        var totalDatasetCount = 0; // datasets counter
        var unlockErrors = false;

        do
        {
            try
            {
                var (itemsToDelete, nextContinuationToken) = await _itemsRetriever.GetItemsAsync(op.Tenant, op.Query, op.Parameters, continuationToken, ct);
                continuationToken = nextContinuationToken;

                _logger.LogInformation("page {pageNumber} - items to delete: {itemCount}",
                    pageCounter++, itemsToDelete!.Count.ToString(CultureInfo.InvariantCulture));


                totalDatasetCount += itemsToDelete.Count;
                await _deletionTaskStatusStorage.UpdateFieldStatusOperationAsync(
                    op.OperationId,
                    Constants.DeleteOperationStatus.DATASETS_CNT,
                    totalDatasetCount.ToString(),
                    ct);

                lockErrors = await LockDatasetsAsync(status, itemsToDelete, successfullyLocked, lockErrors, ct);
                deletionErrors = await _bulkDeletionWorker.RunBulkDeletionAsync(op.Tenant, op.OperationId, successfullyLocked, deletionErrors, ct);
            }
            catch (Exception e) when (e is not OperationCanceledException)
            {
                _logger.LogError(e, "Error while deleting datasets");
            }
            finally
            {
                unlockErrors = await UnlockDatasetsAsync(status, successfullyLocked, unlockErrors);
                successfullyLocked = [];
            }
        } while (continuationToken != null);
        if (lockErrors || deletionErrors || unlockErrors)
        {
            await UpdateStatusAndDeleteOperationAsync(op.OperationId, Status.CompletedWithErrors, ct);
            _logger.LogError("Finished deletion operation {op} with errors", op.OperationId);
        }
        else
        {
            await UpdateStatusAndDeleteOperationAsync(op.OperationId, Status.Completed, ct);
            _logger.LogInformation("Finished deletion operation {op} successfully", op.OperationId);
        }
    }

    private async Task UpdateStatusAndDeleteOperationAsync(string operationId, Status status, CancellationToken ct)
    {
        await _deletionTaskStatusStorage.UpdateFieldStatusOperationAsync(
            operationId, Constants.DeleteOperationStatus.STATUS, status.ToString(), ct);
        await _deletionTaskStatusStorage.UpdateFieldStatusOperationAsync(
            operationId, Constants.DeleteOperationStatus.STATUS_DESCRIPTION, status.Description(), ct);
    }

    private async Task<bool> UnlockDatasetsAsync(IDeleteOperationStatus op, List<DeleteItem> itemsToUnlock, bool unlockErrors)
    {
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

    private async Task<bool> LockDatasetsAsync(
        IDeletionOperationMessage op,
        List<DeleteItem> itemsToDelete,
        List<DeleteItem> successfullyLocked,
        bool lockErrors,
        CancellationToken ct)
    {
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
                await _deletionTaskStatusStorage.IncrementCountAsync(
                    op.OperationId, Constants.DeleteOperationStatus.FAILED_CNT, ct);
                lockErrors = true;
            }
        }

        return lockErrors;
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
