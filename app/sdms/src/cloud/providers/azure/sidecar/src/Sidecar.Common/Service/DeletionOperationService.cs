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
    private readonly IQueueHandlerDeletion _queue;
    private readonly IItemsRetriever _itemsRetriever;
    private readonly IBulkDeletionWorker _bulkDeletionWorker;
    private readonly ILockManager _lockManager;

    private int _consecutiveFailures = 0;
    private const int MAX_CONSECUTIVE_FAILURES = 10;

    public DeletionOperationService(ILogger<DeletionOperationService> logger,
        IQueueHandlerDeletion queue,
        IItemsRetriever itemsRetriever,
        IBulkDeletionWorker bulkDeletionWorker,
        ILockManager lockManager)
    {
        _logger = logger;
        _queue = queue;
        _itemsRetriever = itemsRetriever;
        _bulkDeletionWorker = bulkDeletionWorker;
        _lockManager = lockManager;
    }

    protected override async Task ExecuteAsync(CancellationToken cancellationToken)
    {
        do{
            try {
                var op = await _queue.CheckForDeletionOperationAsync();
                if (op is not null) {
                    //---start the deletion process
                    _logger.LogInformation("Starting deletion operation {0}...", op.OperationId);

                    var itemsToDelete = await _itemsRetriever.GetItems(op.Tenant, op.Subproject, op.Path, cancellationToken);

                    _logger.LogInformation("Found {0} items to delete", itemsToDelete!.Count.ToString(CultureInfo.InvariantCulture));
                    await _queue.UpdateFieldStatusOperation(op.OperationId, Constants.DeleteOperationStatus.DatasetsCnt, itemsToDelete.Count.ToString());

                    for (int i = itemsToDelete.Count - 1; i >= 0; i--)
                    {
                        var item = itemsToDelete[i];
                        string datasetName = GetDatasetName(item);
                        _logger.LogDebug("Acquiring lock for {0}", datasetName);
                        var locked = await _lockManager.AcquireDeleteLock(datasetName);
                        if (!locked)
                        {
                            _logger.LogInformation("Could not acquire lock for {0}", datasetName);
                            await _queue.IncrementCountAsync(op.OperationId, Constants.DeleteOperationStatus.FailedCnt);
                            itemsToDelete.Remove(item);
                        }
                    }

                    await _bulkDeletionWorker.RunBulkDeletion(op.Tenant, op.OperationId, itemsToDelete, cancellationToken);
                }
                _consecutiveFailures = 0;
            }
            catch(Exception ex)
            {
                _logger.LogError(ex, $"Error {ex.Message} while processing deletion operation: {_consecutiveFailures}/{MAX_CONSECUTIVE_FAILURES}");
                _consecutiveFailures++;
            }
            await Task.Delay(1000, cancellationToken);
        } while(!cancellationToken.IsCancellationRequested && _consecutiveFailures < MAX_CONSECUTIVE_FAILURES);
    }

    private static string GetDatasetName(DeleteItem item)
    {
        if (item.Path.EndsWith("/"))
        {
            return item.Path + item.Name;
        }
        else
        {
            return item.Path + "/" + item.Name;
        }
    }
}
