namespace Sidecar.Common.TaskQueue;

using Microsoft.Extensions.Logging;
using Sidecar.Common.Interface;
using Sidecar.Common.Model;
using Sidecar.Common.Service;
using Sidecar.Common.Utility;
using System.Globalization;

public class ChangeTierTaskExecutor : ITaskExecutor<IChangeTierOperationMessage>
{
    private readonly ILogger<ChangeTierTaskExecutor> _logger;
    private readonly IChangeTierTaskStatusStorage _changeTierTaskStatusStorage;
    private readonly ITierItemsRetriever _tieritemsRetriever;
    private readonly IBulkChangeTierWorker _bulkChangeTierWorker;
    private readonly ILockManager _lockManager;

    private const int LOCK_ATTEMPTS = 5;

    public ChangeTierTaskExecutor(
        ILogger<ChangeTierTaskExecutor> logger,
        IChangeTierTaskStatusStorage changeTierTaskStatusStorage,
        ITierItemsRetriever tieritemsRetriever,
        IBulkChangeTierWorker bulkChangeTierWorker,
        ILockManager lockManager)
    {
        _logger = logger;
        _changeTierTaskStatusStorage = changeTierTaskStatusStorage;
        _tieritemsRetriever = tieritemsRetriever;
        _bulkChangeTierWorker = bulkChangeTierWorker;
        _lockManager = lockManager;
    }

    public async Task ProcessAsync(IChangeTierOperationMessage op, CancellationToken ct)
    {
        //---start the change tier process
        _logger.LogInformation("Starting change tier operation {op}...", op.OperationId);
        var status = await _changeTierTaskStatusStorage.CreateChangeTierOperationStatusAsync(op, ct);

        var changeTierErrors = true;
        var lockErrors = true;
        var lockSessionList = new List<WriteLockSession>();
        var successfullyLocked = new List<ChangeTierItem>();
        string? continuationToken = null;
        var i = 0;
        var unlockErrors = false;
        var totalDatasetCount = 0;

        do
        {
            try
            {
                var (itemsToChangeTier, nextContinuationToken) = await _tieritemsRetriever.GetTierItemsAsync(op.Tenant, op.Query, op.Parameters, continuationToken, ct);
                continuationToken = nextContinuationToken;

                _logger.LogInformation("page {pageNumber} - items to change tier: {itemCount}",
                    ++i, itemsToChangeTier!.Count.ToString(CultureInfo.InvariantCulture));

                totalDatasetCount += itemsToChangeTier.Count;
                await _changeTierTaskStatusStorage.UpdateFieldStatusOperationAsync(
                    op.OperationId,
                    Constants.ChangeTierOperationStatus.DATASETS_CNT,
                    totalDatasetCount.ToString(),
                    ct);

                lockSessionList = await LockDatasetsAsync(status, itemsToChangeTier, successfullyLocked, ct);
                lockErrors = CheckLockError(lockSessionList);
                changeTierErrors = await _bulkChangeTierWorker.RunBulkChangeTierAsync(op.Tenant, op.OperationId, op.TierToChange, successfullyLocked, ct);

            }
            catch (Exception e) when (e is not OperationCanceledException)
            {
                _logger.LogError(e, "Error while changing datasets tier");
            }
            finally
            {
                unlockErrors = lockSessionList != null && await UnlockDatasetsAsync(status, successfullyLocked, lockSessionList);
                successfullyLocked.Clear();
            }
            if (lockErrors || changeTierErrors || unlockErrors)
            {
                await UpdateStatusAndChangeTierOperationAsync(op.OperationId, Status.CompletedWithErrors, ct);
                _logger.LogError("Change tier operation {op}, on page {pn} with errors", op.OperationId, i);
            }
            else
            {
                await UpdateStatusAndChangeTierOperationAsync(op.OperationId, Status.Completed, ct);
                _logger.LogInformation("Change tier operation {op}, on page {pn} successfully", op.OperationId, i);
            }
        } while (continuationToken != null);
    }

    private async Task UpdateStatusAndChangeTierOperationAsync(string operationId, Status status, CancellationToken ct)
    {
        await _changeTierTaskStatusStorage.UpdateFieldStatusOperationAsync(
            operationId, Constants.ChangeTierOperationStatus.STATUS, status.ToString(), ct);
        await _changeTierTaskStatusStorage.UpdateFieldStatusOperationAsync(
            operationId, Constants.ChangeTierOperationStatus.STATUS_DESCRIPTION, status.Description(), ct);
    }

    private async Task<bool> UnlockDatasetsAsync(IChangeTierOperationStatus op, List<ChangeTierItem> itemsToUnlock, List<WriteLockSession> lockSessionList)
    {
        var unlockErrors = false;
        bool unlocked;
        int attempt;

        foreach (var lockSession in lockSessionList)
        {
            unlockErrors = false;
            unlocked = false;
            attempt = 0;
            _logger.LogDebug("Removing lock for {n}", lockSession.Key);
            while (!unlocked && attempt < LOCK_ATTEMPTS)
            {
                unlocked = await _lockManager.RemoveWriteLockAsync(lockSession);
                if (!unlocked)
                {
                    _logger.LogError("Could not remove lock for {n} (Attempt {attempt})", lockSession.Key, attempt + 1);
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

    private async Task<List<WriteLockSession>> LockDatasetsAsync(
        IChangeTierOperationMessage op,
        List<ChangeTierItem> itemsToChange,
        List<ChangeTierItem> successfullyLocked,
        CancellationToken ct)
    {
        // var foundLockErrors = false;
        var lockSession = new WriteLockSession();
        var lockSessionList = new List<WriteLockSession>();
        foreach (var item in itemsToChange)
        {
            var datasetName = GetDatasetName(item);
            var lockKey = op.Tenant + "/" + op.Subproject + datasetName;
            _logger.LogDebug("Acquiring lock for {n}", lockKey);
            var attempt = 0;

            while (!lockSession.Locked && attempt < LOCK_ATTEMPTS)
            {
                lockSession = await _lockManager.AcquireWriteLockAsync(lockKey);

                if (!lockSession.Locked)
                {
                    _logger.LogError("Could not acquire lock for {n} (Attempt {attempt})", lockKey, attempt + 1);
                    await Task.Delay(100);
                }
                attempt++;
            }

            if (lockSession.Locked)
            {
                successfullyLocked.Add(item);
                lockSessionList.Add(lockSession);
                lockSession = new WriteLockSession();
            }
            else
            {
                await _changeTierTaskStatusStorage.IncrementCountAsync(
                    op.OperationId, Constants.ChangeTierOperationStatus.FAILED_CNT, ct);
                // foundLockErrors = true;
            }
        }

        return lockSessionList;
    }

    private static string GetDatasetName(ChangeTierItem item)
    {
        if (item.Path.EndsWith("/"))
        {
            return item.Path + item.Name;
        }

        return item.Path + "/" + item.Name;
    }

    private static bool CheckLockError(List<WriteLockSession> lockSessionList)
    {
        var lockError = false;

        foreach (var lockSession in lockSessionList)
        {
            if (!lockSession.Locked)
            {
                return true;
            }
        }

        return lockError;
    }
}
