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
using Sidecar.DeleteOperationRunner.Services;
using Newtonsoft.Json.Linq;
using Newtonsoft.Json;

public class DeletionOperationService : BackgroundService
{
    private readonly ILogger<DeletionOperationService> Logger;
    private readonly IQueueHandlerDeletion Queue;
    private readonly IItemsRetriever ItemsRetriever;
    private readonly IBulkDeletionWorker BulkDeletionWorker;
    private readonly ILockManager LockManager;

    private int ConsecutiveFailures = 0;
    private const int MaxConsecutiveFailures = 10;

    public DeletionOperationService(ILogger<DeletionOperationService> logger,
        IQueueHandlerDeletion queue,
        IItemsRetriever itemsRetriever,
        IBulkDeletionWorker bulkDeletionWorker,
        ILockManager lockManager)
    {
        Logger = logger;
        Queue = queue;
        ItemsRetriever = itemsRetriever;
        BulkDeletionWorker = bulkDeletionWorker;
        LockManager = lockManager;
    }

    protected override async Task ExecuteAsync(CancellationToken cancellationToken)
    {
        do{
            try {
                var op = await Queue.CheckForDeletionOperationAsync();
                if (op is not null) {
                    //---start the deletion process
                    Logger.LogInformation("Starting deletion operation {0}...", op.OperationId);

                    var items = await ItemsRetriever.GetItems(op.Subproject, op.Path);

                    Logger.LogInformation("Found {0} items to delete", items!.Count.ToString(CultureInfo.InvariantCulture));
                    await Queue.UpdateStatusAsync(op.OperationId, items.Count);
                   
                    foreach (var item in items)
                    {
                        var datasetName = item.Path + item.Name;
                        Logger.LogInformation("Acquiring lock for {0}", datasetName);
                        var locked = await LockManager.AcquireDeleteLock(datasetName);
                        Logger.LogInformation("Is locked {0} - {1}", datasetName, locked);
                        if (!locked)
                        {
                            items.Remove(item);
                        }
                    }

                    await BulkDeletionWorker.RunBulkDeletion(op.OperationId, items);
                }
                ConsecutiveFailures = 0;
            }
            catch(Exception ex)
            {
                Logger.LogError(ex, $"Error {ex.Message} while processing deletion operation: {ConsecutiveFailures}/{MaxConsecutiveFailures}");
                ConsecutiveFailures++;
            }
            await Task.Delay(1000,cancellationToken);
        }while(!cancellationToken.IsCancellationRequested && ConsecutiveFailures < MaxConsecutiveFailures);
    }
}
