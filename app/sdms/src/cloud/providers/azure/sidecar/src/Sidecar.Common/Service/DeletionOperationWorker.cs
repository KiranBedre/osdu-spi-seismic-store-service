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

namespace Sidecar.Common.Service
{
    using Microsoft.Extensions.Hosting;
    using Microsoft.Extensions.Logging;
    using System.Diagnostics;
    using Model;
    using System.Globalization;
    using System.Drawing.Printing;

    public class DeletionOperationService<TStorageOptions, TQueueOptions, TCosmosOptions, TQueueMessage> : BackgroundService
        where TStorageOptions : class
        where TQueueOptions : class
        where TCosmosOptions : class
        where TQueueMessage : class,  IDeleteionOperationMessage
    {
        private readonly ILogger<DeletionOperationService<TStorageOptions, TQueueOptions, TCosmosOptions, TQueueMessage>> Logger;
        private readonly IQueueHandlerDeletion<TQueueOptions, IDeleteionOperationMessage> Queue;
        private readonly IItemsRetriever<TCosmosOptions> ItemsRetriever;
        private readonly IBulkDeletionWorker<TStorageOptions> BulkDeletionWorker;

        private int ConsecutiveFailures = 0;
        private const int MaxConsecutiveFailures = 10;

        public DeletionOperationService(ILogger<DeletionOperationService<TStorageOptions, TQueueOptions, TCosmosOptions, TQueueMessage>> logger,
            IQueueHandlerDeletion<TQueueOptions, IDeleteionOperationMessage> queue,
            IItemsRetriever<TCosmosOptions> itemsRetriever,
            IBulkDeletionWorker<TStorageOptions> bulkDeletionWorker)
        {
            Logger = logger;
            Queue = queue;
            ItemsRetriever = itemsRetriever;
            BulkDeletionWorker = bulkDeletionWorker;

        }

        protected override async Task ExecuteAsync(CancellationToken cancellationToken)
        {
            do{
                try {
                    var op = await Queue.CheckForDeletionOperationAsync();
                    if (op is not null) {
                        //---start the deletion process
                        Logger.LogInformation("Starting deletion operation {0}...", op.OperationId);


                        var paginatedRecords = await ItemsRetriever.GetItems(op.Subproject, op.Path);
                        var items = paginatedRecords.records;
                        // todo: add total number in Redis operation
                        Logger.LogInformation("Found {0} items to delete", items.Count.ToString(CultureInfo.InvariantCulture));

                        //todo: lock all found items

                        //---start the deletion process
                        await BulkDeletionWorker.RunBulkDeletion(items);
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
}
