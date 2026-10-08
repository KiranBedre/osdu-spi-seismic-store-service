// ============================================================================
// Copyright 2026, Microsoft
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

using Azure.Core;
using Azure.Identity;
using Azure.Security.KeyVault.Secrets;
using Azure.Storage.Queues;
using CommandLine;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Azure;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Serilog;
using Serilog.Events;
using Sidecar.Common.Config;
using Sidecar.Common.Extensions;
using Sidecar.Common.Interface;
using Sidecar.Common.Logging;
using Sidecar.Common.Resilience;
using Sidecar.Common.Service;
using Sidecar.Common.TaskQueue;
using Sidecar.Common.Utility;

public class Program
{
    private static ILogger<Program>? _logger;

    private static void HandleOptionsParserError(IEnumerable<Error> errs)
    {
        var errorMessage = errs
            .Select(err => err.ToString())
            .Where(x => x is not null)!
            .Aggregate((x, y) => x + Environment.NewLine + y);
        throw new ArgumentException(errorMessage);
    }

    private static void AttemptOptionsFromEnv(OptionsRestore opts)
    {
        _logger?.LogWarning("Checking environment variables for options...");

        opts.WebHostPort ??= Environment.GetEnvironmentVariable("HOST_PORT")!;
        opts.RedisQueueHostname ??= Environment.GetEnvironmentVariable("SDMS_REDIS_QUEUE_HOSTNAME")!;
        opts.RedisQueuePassword ??= Environment.GetEnvironmentVariable("SDMS_REDIS_QUEUE_PASSWORD")!;
        opts.RedisQueuePort ??= Environment.GetEnvironmentVariable("SDMS_REDIS_QUEUE_PORT")!;
        opts.RedisLocksHostname ??= Environment.GetEnvironmentVariable("SDMS_REDIS_LOCKS_HOSTNAME")!;
        opts.RedisLocksPassword ??= Environment.GetEnvironmentVariable("SDMS_REDIS_LOCKS_PASSWORD")!;
        opts.RedisLocksPort ??= Environment.GetEnvironmentVariable("SDMS_REDIS_LOCKS_PORT")!;
        opts.KeyVaultUrl ??= Environment.GetEnvironmentVariable("SDMS_KEYVAULT_URL")!;
        opts.DesUrl ??= Environment.GetEnvironmentVariable("DES_SERVICE_HOST")!;
        opts.TaskStorageQueueName = Environment.GetEnvironmentVariable("SDMS_RESTORE_QUEUE") ?? opts.TaskStorageQueueName;
        opts.RedisMsiEnabled ??= Environment.GetEnvironmentVariable("AZURE_MSI_ISENABLED")!;
        opts.RedisClientId ??= Environment.GetEnvironmentVariable("REDIS_CLIENT_ID")!;
        opts.MaxDequeueCount ??= Environment.GetEnvironmentVariable("SDMS_RESTORE_MAX_DEQUEUE_COUNT");
        opts.AzureSubscriptionId = ResolveRequiredValue(
            opts.AzureSubscriptionId,
            "AZURE_SUBSCRIPTION_ID",
            "AzureSubscriptionId");
        opts.AzureResourceGroup = ResolveRequiredValue(
            opts.AzureResourceGroup,
            "AZURE_RESOURCE_GROUP",
            "AzureResourceGroup");
    }

    private static string ResolveRequiredValue(string? optionValue, string envVarName, string optionName)
    {
        var resolvedValue = string.IsNullOrWhiteSpace(optionValue)
            ? Environment.GetEnvironmentVariable(envVarName)
            : optionValue;

        return string.IsNullOrWhiteSpace(resolvedValue)
            ? throw new ArgumentException($"{optionName} is required and cannot be null, empty, or whitespace.")
            : resolvedValue;
    }

    private static int ResolveMaxDequeueCount(string? configured)
    {
        if (int.TryParse(configured, out var value) && value > 0)
        {
            return value;
        }

        return Constants.RestoreConfiguration.DEFAULT_MAX_DEQUEUE_COUNT;
    }

    private static async Task AttemptOptionsFromKeyVaultAsync(OptionsRestore opts)
    {
        var secretClient = new SecretClient(
            new Uri(opts.KeyVaultUrl),
            new DefaultAzureCredential() // CodeQL [SM05141] In production, AZURE_TOKEN_CREDENTIALS=prod disables developer credentials.
        );

        _logger?.LogInformation("Checking KeyVault variables for options...");

        var secretResponses = await Task.WhenAll(
            secretClient.GetSecretAsync(Constants.SecretNames.REDIS_LOCKS_HOSTNAME),
            secretClient.GetSecretAsync(Constants.SecretNames.REDIS_LOCKS_PASSWORD),
            secretClient.GetSecretAsync(Constants.SecretNames.REDIS_SHARED_HOSTNAME),
            secretClient.GetSecretAsync(Constants.SecretNames.REDIS_SHARED_PASSWORD),
            secretClient.GetSecretAsync(Constants.SecretNames.APP_RESOURCE_ID));

        opts.StorageQueueEndpoint = Environment.GetEnvironmentVariable("CENTRAL_STORAGE_QUEUE_ENDPOINT")
            ?? (await secretClient.GetSecretAsync(Constants.SecretNames.CENTRAL_STORAGE_QUEUE_ENDPOINT)).Value.Value;

        var secrets = secretResponses.Select(s => s.Value.Value).ToArray();
        opts.RedisLocksHostname ??= secrets[0];
        opts.RedisLocksPassword ??= secrets[1];
        opts.RedisQueueHostname ??= secrets[2];
        opts.RedisQueuePassword ??= secrets[3];
        opts.AppResourceId ??= secrets[4];

        _logger?.LogInformation("Got variables from Key Vault.");
    }

    private static async Task RunAsync(OptionsRestore opts)
    {
        var webApplicationBuilder = WebApplication.CreateBuilder();

        ConfigureServices(webApplicationBuilder.Services, opts);

        Log.Logger = new LoggerConfiguration()
            .MinimumLevel.Information()
            .MinimumLevel.Override("Azure", LogEventLevel.Warning)
            .MinimumLevel.Override("Azure.Core", LogEventLevel.Warning)
            .MinimumLevel.Override("Polly", LogEventLevel.Warning)
            .Enrich.FromLogContext()
            .WriteTo.Console(new ConsoleJsonFormatter())
            .CreateLogger();

        _ = webApplicationBuilder.Host.UseSerilog();

        var localUrl = $"http://0.0.0.0:{opts.WebHostPort}";
        _ = webApplicationBuilder.WebHost.UseUrls(localUrl);
        Log.Information("Sidecar.RestoreRunner will bind to {LocalUrl}", localUrl);

        var webapp = webApplicationBuilder.Build();
        _ = webapp.UseHealthChecks("/healthz");

        try
        {
            await webapp.RunAsync();
        }
        catch (Exception ex)
        {
            Log.Error(ex, "An error occurred while running Sidecar.RestoreRunner.");
            throw;
        }
        finally
        {
            await Log.CloseAndFlushAsync();
        }
    }

    private static void ConfigureServices(IServiceCollection services, OptionsRestore opts)
    {
        services.AddAzureClients(builder =>
        {
            _ = builder.AddSecretClient(new Uri(opts.KeyVaultUrl));
        });

        _ = services.AddResiliencePipelines();
        _ = services.AddSingleton<CosmosDbRetryOptions>();
        _ = services.AddSingleton<StorageRetryOptions>();
        _ = services.AddSingleton<TokenCredential, DefaultAzureCredential>();
        _ = services.AddSingleton<HttpClient>();

        if (!string.IsNullOrEmpty(opts.DesUrl))
        {
            _ = services
                .AddSingleton<DesClient>()
                .AddSingleton<IDesClient>(sp => new CachingDesClient(sp.GetRequiredService<DesClient>()));
        }
        else
        {
            _logger!.LogWarning("Using DES client from environment");
            _ = services.AddSingleton<IDesClient, DesClientFromEnv>();
        }

        _ = services
            .AddSingleton<CosmosClientFactory>()
            .AddSingleton<ICosmosClientFactory>(
                sp => new CachingCosmosClientFactory(sp.GetRequiredService<CosmosClientFactory>()));

        _ = services
            .AddSingleton<Cosmos>()
            .AddSingleton<IDataAccess>(sp => sp.GetRequiredService<Cosmos>());

        _ = services
            .AddSingleton<IOptionsRestore>(opts)
            .AddSingleton<IOptionsQueueRedis>(sp => sp.GetRequiredService<IOptionsRestore>())
            .AddSingleton<IOptionsLocksRedis>(sp => sp.GetRequiredService<IOptionsRestore>())
            .AddSingleton<IOptionsQueueNameRedis>(sp => sp.GetRequiredService<IOptionsRestore>())
            .AddSingleton<IOptionsDataEcosystemService>(sp => sp.GetRequiredService<IOptionsRestore>())
            .AddSingleton<IOptionsStorageQueue>(sp => sp.GetRequiredService<IOptionsRestore>())
            .AddSingleton<IOptionsAzureResourceScope>(sp => sp.GetRequiredService<IOptionsRestore>())
            .AddSingleton<IOptionsRedisMsi>(sp => sp.GetRequiredService<IOptionsRestore>())
            .AddSingleton(new TaskQueueBackgroundServiceOptions
            {
                DelayWhenTaskNotFound = TimeSpan.FromSeconds(5),
            })
            .AddSingleton(new StorageQueueWorkerOptions
            {
                LockDuration = TimeSpan.FromMinutes(5),
                LockRenewalPeriod = TimeSpan.FromMinutes(3),
                MaxDequeueCount = ResolveMaxDequeueCount(opts.MaxDequeueCount),
            });

        _ = services
            .AddRedisConnectionFactory(opts, _logger!)
            .AddSingleton<IRedisConnectionFactory<RedisLocksConnectionFactory>, RedisLocksConnectionFactory>()
            .AddSingleton<IRedisConnectionFactory<RedisQueueConnectionFactory>, RedisQueueConnectionFactory>()
            .AddSingleton<ILockManager, LockManager>()
            .AddSingleton<IRestoreOperationStatusStorage, CosmosRestoreTaskStatusStorage>()
            .AddSingleton<IArchivedSnapshotSelector, ArchivedSnapshotSelector>()
            .AddSingleton<IMetadataRestoreService, MetadataRestoreService>()
            .AddSingleton<IDatasetStorageInfoProvider, CosmosDatasetStorageInfoProvider>()
            .AddSingleton<IAzureStorageResourceResolver, AzureStorageResourceResolver>()
            .AddSingleton<IContainerRestoreService, ContainerRestoreService>()
            .AddSingleton<IBlobRestoreService, BlobRestoreService>()
            .AddSingleton<IBlobClientFactory>(sp => new BlobClientFactory(
                sp.GetRequiredService<ILogger<BlobClientFactory>>(),
                sp.GetRequiredService<IDesClient>(),
                sp.GetRequiredService<SecretClient>(),
                sp.GetRequiredService<TokenCredential>()))
            .AddSingleton<QueueClientFactory>()
            .AddSingleton<QueueClient>(sp => sp.GetRequiredService<QueueClientFactory>().Build())
            .AddSingleton<RestoreJsonDeserializer>()
            .AddSingleton<RestoreTaskExecutor>()
            .AddSingleton<StorageQueueWorker<
                IRestoreOperationMessage,
                RestoreJsonDeserializer,
                RestoreTaskExecutor
            >>()
            .AddHostedService<TaskQueueBackgroundService<
                StorageQueueWorker<
                    IRestoreOperationMessage,
                    RestoreJsonDeserializer,
                    RestoreTaskExecutor
                >
            >>();

        _ = services
            .AddHealthChecks()
            .AddRedis(
                sp => sp.GetRequiredService<IRedisConnectionFactory<RedisLocksConnectionFactory>>().GetRedis().GetConnection(),
                name: "redis-locks-connectivity-check",
                timeout: TimeSpan.FromMinutes(1))
            .AddRedis(
                sp => sp.GetRequiredService<IRedisConnectionFactory<RedisQueueConnectionFactory>>().GetRedis().GetConnection(),
                name: "redis-queue-connectivity-check",
                timeout: TimeSpan.FromMinutes(1));
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

        var res = parser.ParseArguments<OptionsRestore>(args);

        if (res.Errors.Any())
        {
            var opts = res.Value ?? new OptionsRestore();
            AttemptOptionsFromEnv(opts);
            await AttemptOptionsFromKeyVaultAsync(opts);
            args = parser.FormatCommandLine(opts).Split(' ');
        }

        parser = new Parser(settings =>
        {
            settings.CaseInsensitiveEnumValues = true;
            settings.HelpWriter = Console.Error;
            settings.IgnoreUnknownArguments = true;
        });

        _ = await parser.ParseArguments<OptionsRestore>(args)
            .WithNotParsed(HandleOptionsParserError)
            .WithParsedAsync(RunAsync);
    }
}
