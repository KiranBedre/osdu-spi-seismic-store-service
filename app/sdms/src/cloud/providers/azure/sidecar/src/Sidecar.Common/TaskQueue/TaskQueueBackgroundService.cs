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

namespace Sidecar.Common.TaskQueue;

using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Sidecar.Common.Config;
using Sidecar.Common.Interface;
using Sidecar.Common.Model;

/// <summary>
/// Background service that works on the given task queue until cancellation.
/// </summary>
public class TaskQueueBackgroundService<TW>(
    ILogger<TaskQueueBackgroundService<TW>> logger,
    TW worker,
    TaskQueueBackgroundServiceOptions opts) : BackgroundService
    where TW : ITaskQueueWorker
{
    private readonly ILogger<TaskQueueBackgroundService<TW>> _logger = logger;
    private readonly TW _worker = worker;
    private readonly TaskQueueBackgroundServiceOptions _opts = opts;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (true)
        {
            stoppingToken.ThrowIfCancellationRequested();
            try
            {
                var status = await _worker.HandleNextTaskAsync(stoppingToken);
                if (status is ExecutionStatus.TaskNotFound)
                {
                    _logger.LogInformation(
                        "There are no tasks. Will retry after {Timeout}", _opts.DelayWhenTaskNotFound);
                    await Task.Delay(_opts.DelayWhenTaskNotFound, stoppingToken);
                }
            }
            catch (Exception e) when (e is not OperationCanceledException)
            {
                _logger.LogError(e, "Error when handling a task. Continue...");
            }
        }
    }
}
