// ============================================================================
// Copyright 2026, Microsoft Corporation
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

namespace Sidecar.RestoreRunner;

using CommandLine;
using Sidecar.Common.Interface;

#pragma warning disable CS8618

/// <summary>
/// CLI / env-var options for the Restore Runner.
/// The queue name is read from SDMS_RESTORE_QUEUE env var.
/// </summary>
public class OptionsRestore :
    IOptionsRestore
{
    [Option("port", Required = false, Default = "6000")]
    public string WebHostPort { get; set; }

    [Option("keyVaultUrl", Required = true)]
    public string KeyVaultUrl { get; set; }

    [Option("desUrl", Required = false)]
    public string DesUrl { get; set; }

    [Option("redisQueueHostname", Required = false)]
    public string RedisQueueHostname { get; set; }

    [Option("redisQueuePassword", Required = false)]
    public string RedisQueuePassword { get; set; }

    [Option("redisQueuePort", Required = false, Default = "6380")]
    public string RedisQueuePort { get; set; }

    [Option("redisLocksHostname", Required = false)]
    public string RedisLocksHostname { get; set; }

    [Option("redisLocksPassword", Required = false)]
    public string RedisLocksPassword { get; set; }

    [Option("redisLocksPort", Required = false, Default = "6380")]
    public string RedisLocksPort { get; set; }

    [Option("redisMsiEnabled", Required = false)]
    public string? RedisMsiEnabled { get; set; }

    [Option("redisClientId", Required = false)]
    public string? RedisClientId { get; set; }

    [Option("appResourceId", Required = false)]
    public string? AppResourceId { get; set; }

    [Option("azureSubscriptionId", Required = true)]
    public string AzureSubscriptionId { get; set; }

    [Option("azureResourceGroup", Required = true)]
    public string AzureResourceGroup { get; set; }

    /// <summary>Storage Queue name for restore tasks (env: SDMS_RESTORE_QUEUE).</summary>
    [Option("taskStorageQueueName", Required = false, Default = "sdms-queue-restore")]
    public string TaskStorageQueueName { get; set; }

    [Option("statusRedisQueueName", Required = false)]
    public string StatusRedisQueueName { get; set; }

    [Option("connectTimeoutMilliseconds", Required = false, Default = "10000")]
    public string ConnectTimeoutMilliseconds { get; set; }

    [Option("syncTimeoutMilliseconds", Required = false, Default = "5000")]
    public string SyncTimeoutMilliseconds { get; set; }

    [Option("storageQueueEndpoint", Required = false, HelpText = "Queue endpoint to connect to the task queue on Azure Storage")]
    public string? StorageQueueEndpoint { get; set; }

    /// <summary>
    /// Maximum number of queue deliveries a single restore message may receive before it is
    /// discarded (env: SDMS_RESTORE_MAX_DEQUEUE_COUNT). Sizes the total blob-restore budget
    /// (approximately MaxDequeueCount x POLL_MAX_DURATION_HOURS) for very large datasets.
    /// Falls back to <see cref="Sidecar.Common.Utility.Constants.RestoreConfiguration.DEFAULT_MAX_DEQUEUE_COUNT"/>
    /// when unset or invalid.
    /// </summary>
    [Option("maxDequeueCount", Required = false, HelpText = "Max queue deliveries per restore message before it is discarded (env: SDMS_RESTORE_MAX_DEQUEUE_COUNT).")]
    public string? MaxDequeueCount { get; set; }
}
