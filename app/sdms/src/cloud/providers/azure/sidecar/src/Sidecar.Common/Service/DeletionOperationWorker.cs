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

    public class DeletionOperationService<TQueueOptions, TQueueMessage> : BackgroundService
        where TQueueOptions : class
        where TQueueMessage : class, IDeleteOperationMessage
    {
        private readonly ILogger<DeletionOperationService<TQueueOptions, TQueueMessage>> Logger;
        private readonly IQueueHandlerDeletion<IQueueOptionsRedis, IDeleteOperationMessage> Queue;
        private readonly Stopwatch RunTimer;

        public DeletionOperationService(ILogger<DeletionOperationService<TQueueOptions, TQueueMessage>> logger, IQueueHandlerDeletion<IQueueOptionsRedis, IDeleteOperationMessage> queue)
        {
            RunTimer = new Stopwatch();
            Logger = logger;
            Queue = queue;
        }

        protected override async Task ExecuteAsync(CancellationToken cancellationToken)
        {
            do{
                var op = await Queue.CheckForDeletionOperationAsync();
                if(op is not null){
                    //---start the deletion process
                    Logger.LogInformation("Starting deletion operation {0}...", op.OperationId);

                    //---TODO: execute the deletion operation here...
                }
                await Task.Delay(1000,cancellationToken);
            }while(!cancellationToken.IsCancellationRequested);
        }
    }
}