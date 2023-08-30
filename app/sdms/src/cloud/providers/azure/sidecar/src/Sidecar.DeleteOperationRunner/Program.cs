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

using Azure.Core;
using Azure.Identity;
using Azure.Security.KeyVault.Secrets;
using CommandLine;
using Microsoft.Extensions.Azure;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Sidecar.Common.Utility;

namespace Sidecar.DeleteOperationRunner;

public class Program
{
    private static ILogger<Program>? _logger;
    private static void HandleOptionsParserError(IEnumerable<Error> errs)
    {
        var errorMessage = errs.Select(err => err.ToString()).Where(x => x is not null)!.Aggregate((x, y) => x + Environment.NewLine + y);
        throw new ArgumentException(errorMessage);
    }

    private static void AttemptOptionsFromEnv(Options opts)
    {
        _logger?.LogWarning("Checking environment variables for options...");

        opts.CosmosEndpoint ??= Environment.GetEnvironmentVariable("SDMS_COSMOS_ENDPOINT")!;
        opts.CosmosKey ??= Environment.GetEnvironmentVariable("SDMS_COSMOS_KEY")!;

        opts.StorageAccountName ??= Environment.GetEnvironmentVariable("SDMS_STORAGE_ACCOUNT_NAME")!;
        opts.StorageAccountConnectionString ??= Environment.GetEnvironmentVariable("SDMS_STORAGE_CONNSTR")!;

        opts.QueueName ??= Environment.GetEnvironmentVariable("SDMS_REDIS_QUEUE_NAME")!;

        opts.RedisQueueHostname ??= Environment.GetEnvironmentVariable("SDMS_REDIS_QUEUE_HOSTNAME")!;
        opts.RedisQueuePassword ??= Environment.GetEnvironmentVariable("SDMS_REDIS_QUEUE_PASSWORD")!;
        opts.RedisQueuePort ??= Environment.GetEnvironmentVariable("SDMS_REDIS_QUEUE_PORT")!;

        opts.RedisLocksHostname ??= Environment.GetEnvironmentVariable("SDMS_REDIS_LOCKS_HOSTNAME")!;
        opts.RedisLocksPassword ??= Environment.GetEnvironmentVariable("SDMS_REDIS_LOCKS_PASSWORD")!;
        opts.RedisLocksPort ??= Environment.GetEnvironmentVariable("SDMS_REDIS_LOCKS_PORT")!;

        opts.KeyVaultUrl ??= Environment.GetEnvironmentVariable("SDMS_KEYVAULT_URL")!;

        opts.DesUrl ??= Environment.GetEnvironmentVariable("DES_SERVICE_HOST")!;
    }

    private static async Task AttemptOptionsFromKeyVault(Options opts)
    {
        var secretClient = new SecretClient(new Uri(opts.KeyVaultUrl), new DefaultAzureCredential());

        _logger?.LogInformation("Checking KeyVault variables for options...");
        var secretResponses = await Task.WhenAll(
            secretClient.GetSecretAsync(Constants.SecretNames.REDIS_LOCKS_HOSTNAME),
            secretClient.GetSecretAsync(Constants.SecretNames.REDIS_LOCKS_PASSWORD),
            secretClient.GetSecretAsync(Constants.SecretNames.REDIS_QUEUE_HOSTNAME),
            secretClient.GetSecretAsync(Constants.SecretNames.REDIS_QUEUE_PASSWORD),
            secretClient.GetSecretAsync(Constants.SecretNames.APP_RESOURCE_ID));

        _logger?.LogInformation("Got variables from Key Vault...");

        var secrets = secretResponses.Select(s => s.Value.Value).ToArray();

        opts.RedisLocksHostname ??= secrets[0];
        opts.RedisLocksPassword ??= secrets[1];
        opts.RedisQueueHostname ??= secrets[2];
        opts.RedisQueuePassword ??= secrets[3];
        opts.AppResourceId ??= secrets[4];
    }

    private static async Task RunAsync(Options opts)
    {

        var host = Host.CreateDefaultBuilder()
            .ConfigureServices(services =>
            {
                services.AddAzureClients(builder =>
                {
                    builder.AddSecretClient(new Uri(opts.KeyVaultUrl));
                });

                // From the local machine, the user is expected to az login and have access to all dependencies
                // such as Key Vault, CosmosDB, Storage accounts.
                // When deployed, there will be a pod identity with access to these dependencies.
                // DefaultAzureCredential works in both cases.
                services.AddSingleton<TokenCredential, DefaultAzureCredential>();

                if (!string.IsNullOrEmpty(opts.DesUrl))
                {
                    services
                        .AddSingleton<DesClient>()
                        .AddSingleton<IDesClient>(
                            sp => new CachingDesClient(sp.GetRequiredService<DesClient>()));
                }
                else
                {
                    _logger.LogWarning("Using DES client from environment");
                    services.AddSingleton<IDesClient, DesClientFromEnv>();
                }

                services
                    .AddSingleton<CosmosClientFactory>()
                    .AddSingleton<ICosmosClientFactory>(
                        sp => new CachingCosmosClientFactory(sp.GetRequiredService<CosmosClientFactory>()));

                services
                    .AddSingleton<BlobClientFactory>()
                    .AddSingleton<IBlobClientFactory>(
                        sp => new CachingBlobClientFactory(sp.GetRequiredService<BlobClientFactory>()));

                services
                    .AddSingleton<RedisConnectionFactory>()
                    .AddSingleton<IRedisConnectionFactory>(sp =>
                        new CachingRedisConnectionFactory(sp.GetRequiredService<RedisConnectionFactory>()));

                services
                    .AddSingleton<IOptions>(opts)
                    .AddSingleton<IOptionsCosmos>(sp => sp.GetRequiredService<IOptions>())
                    .AddSingleton<IOptionsQueueRedis>(sp => sp.GetRequiredService<IOptions>())
                    .AddSingleton<IOptionsLocksRedis>(sp => sp.GetRequiredService<IOptions>())
                    .AddSingleton<IOptionsStorageAccount>(sp => sp.GetRequiredService<IOptions>())
                    .AddSingleton<IOptionsQueueRedisQueueName>(sp => sp.GetRequiredService<IOptions>())
                    .AddSingleton<IItemsRetriever, DeleteItemsRetriever>()
                    .AddSingleton<IMetadataDeletionWorker, MetadataDeletionWorker>()
                    .AddSingleton<IBlobClientFactory, BlobClientFactory>()
                    .AddSingleton<IBulkDeletionWorker,
                        BulkDeletionWorker>()
                    .AddSingleton<IDeletionTasksStorage, RedisDeletionTasksStorage>()
                    .AddHostedService<DeletionOperationService>()
                    .AddSingleton<ILockManager, LockManager>()
                    .AddScoped<IDataAccess, Cosmos>();
            }).ConfigureLogging(lg => _ = lg
                .ClearProviders()
                .AddSimpleConsole(o =>
                {
                    o.SingleLine = true;
                    o.TimestampFormat = "[HH:mm:ss:fff] ";
                })
            ).Build();

        await host.RunAsync();
    }

    private static async Task Main(string[] args)
    {
        using var loggerFactory = LoggerFactory.Create(builder => builder.AddSimpleConsole(o =>
        {
            o.IncludeScopes = true;
            o.SingleLine = true;
            o.TimestampFormat = "[HH:mm:ss:fff] ";
        }));

        _logger = loggerFactory.CreateLogger<Program>();

        var parser = new Parser(settings =>
        {
            settings.CaseInsensitiveEnumValues = true;
            settings.IgnoreUnknownArguments = true;
        });

        var res = parser.ParseArguments<Options>(args);

        //---if parsing did not succeed, try to read from env for values instead
        if (res.Errors.Any())
        {
            var opts = res.Value ?? new Options();
            AttemptOptionsFromEnv(opts);
            await AttemptOptionsFromKeyVault(opts);

            //---update the args to include the env vars
            args = parser.FormatCommandLine(opts).Split(' ');
        }

        parser = new Parser(settings =>
        {
            settings.CaseInsensitiveEnumValues = true;
            settings.HelpWriter = Console.Error;
            settings.IgnoreUnknownArguments = true;
        });

        //---parse again in case anything is still missing, if not run the app
        _ = await parser.ParseArguments<Options>(args)
            .WithNotParsed(HandleOptionsParserError)
            .WithParsedAsync(RunAsync);
    }
}
