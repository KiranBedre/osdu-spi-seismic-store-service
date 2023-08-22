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

namespace Sidecar.Common.HealthChecks;

using Microsoft.Extensions.Diagnostics.HealthChecks;
using Sidecar.Common.Interface;

public class TaskQueueExistenceCheck : IHealthCheck
{
    private readonly IRedisHandler _redis;
    private readonly string _queueName;

    public TaskQueueExistenceCheck(IRedisConnectionFactory redisConnectionFactory, IOptionsQueueRedisQueueName queueOptions)
    {
        _redis = redisConnectionFactory.GetRedisForQueue();
        _queueName = queueOptions.QueueName;
    }

    public async Task<HealthCheckResult> CheckHealthAsync(HealthCheckContext context, CancellationToken cancellationToken = default)
    {
        var queueExists = await _redis.GetDatabase().KeyExistsAsync(_queueName);

        return queueExists
            ? HealthCheckResult.Healthy()
            : HealthCheckResult.Unhealthy($"Task queue {_queueName} missing");
    }
}
