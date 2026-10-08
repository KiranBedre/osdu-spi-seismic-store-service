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

namespace Sidecar.Common.Model;

using CommandLine;
using Interface;

# pragma warning disable CS8618 // Non-nullable field is uninitialized. Consider declaring as nullable.

public class OptionsChangeTier : IOptionsChangeTier
{
    [Option("port", Required = false, Default = "6000", HelpText = "Port on which to expose the endpoints")]
    public string WebHostPort { get; set; }

    [Option("keyVaultUrl", Required = true, HelpText = "KeyVault endpoint URL, e.g. https://mytestkv.vault.azure.net/")]
    public string KeyVaultUrl { get; set; }

    [Option("desUrl", Required = false, HelpText = "Data Ecosystem Service url.")]
    public string DesUrl { get; set; }

    [Option("cosmosUrl", Required = false, HelpText = "Cosmos endpoint URL (if DES unavailable)")]
    public string CosmosEndpoint { get; set; }

    [Option("cosmosPrimaryKey", Required = false, HelpText = "Primary Key for Cosmos (if DES unavailable)")]
    public string CosmosKey { get; set; }

    [Option("storageAccountName", Required = false, HelpText = "Storage account name (if DES unavailable)")]
    public string StorageAccountName { get; set; }

    [Option("storageAccountConnectionString", Required = false, HelpText = "Storage account connection string. If provided, overrides DES and StorageAccountName")]
    public string StorageAccountConnectionString { get; set; }

    [Option("redisQueueHostname", Required = false, HelpText = "Hostname of the Redis instance that contains the task queue ")]
    public string RedisQueueHostname { get; set; }

    [Option("redisQueuePassword", Required = false, HelpText = "Password of the Redis instance that contains the task queue ")]
    public string RedisQueuePassword { get; set; }

    [Option("redisQueuePort", Required = false, Default = "6380", HelpText = "Port of the Redis instance that contains the task queue ")]
    public string RedisQueuePort { get; set; }

    [Option("redisLocksHostname", Required = false, HelpText = "Hostname of the Redis instance that contains the locks ")]
    public string RedisLocksHostname { get; set; }

    [Option("redisLocksPassword", Required = false, HelpText = "Password of the Redis instance that contains the locks ")]
    public string RedisLocksPassword { get; set; }

    [Option("redisLocksPort", Required = false, Default = "6380", HelpText = "Port of the Redis instance that contains the locks ")]
    public string RedisLocksPort { get; set; }

    [Option("appResourceId", Required = false, HelpText = "AD resource ID, e.g. https://management.azure.com/")]
    public string AppResourceId { get; set; }

    [Option("appInsightsInstrumentationKey", Required = false, HelpText = "AppInsights instrumentation key")]
    public string AppInsightsInstrumentationKey { get; set; }

    [Option("storageQueueEndpoint", Required = false, HelpText = "Queue endpoint to connect to the task queue on Azure Storage")]
    public string StorageQueueEndpoint { get; set; }

    [Option("taskStorageQueueName", Required = false, Default = "sdms-queue-changetier", HelpText = "Name of the Azure Storage queue for changetier operation tasks")]
    public string TaskStorageQueueName { get; set; }

    [Option("statusRedisQueueName", Required = false, Default = "sdms-queue-changetier", HelpText = "Key name of the list with the changetier operation statuses in Redis")]
    public string StatusRedisQueueName { get; set; }

    [Option("redisMsiEnabled", Required = false, HelpText = "Whether MSI-based Redis authentication is enabled")]
    public string? RedisMsiEnabled { get; set; }

    [Option("redisClientId", Required = false, HelpText = "Client ID of the managed identity to use for Redis authentication")]
    public string? RedisClientId { get; set; }

    [Option("connectTimeoutMilliseconds", Required = false, Default = "10000", HelpText = "Specifies the time in milliseconds that should be allowed for connection")]
    public string ConnectTimeoutMilliseconds { get; set; }

    [Option("syncTimeoutMilliseconds", Required = false, Default = "5000", HelpText = "Specifies the time in milliseconds that the system should allow for synchronous operations")]
    public string SyncTimeoutMilliseconds { get; set; }
}
