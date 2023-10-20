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

namespace Sidecar.DeleteOperationRunner;
using Azure.Core;
using Azure.Identity;
using Azure.Security.KeyVault.Secrets;
using CommandLine;
using Microsoft.ApplicationInsights.AspNetCore.Extensions;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Azure;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.ApplicationInsights;
using Sidecar.Common.Config;
using Sidecar.Common.HealthChecks;
using Sidecar.Common.TaskQueue;
using Sidecar.Common.Utility;

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

        opts.WebHostPort ??= Environment.GetEnvironmentVariable("HOST_PORT")!;

        opts.CosmosEndpoint ??= Environment.GetEnvironmentVariable("SDMS_COSMOS_ENDPOINT")!;
        opts.CosmosKey ??= Environment.GetEnvironmentVariable("SDMS_COSMOS_KEY")!;

        opts.StorageAccountName ??= Environment.GetEnvironmentVariable("SDMS_STORAGE_ACCOUNT_NAME")!;
        opts.StorageAccountConnectionString ??= Environment.GetEnvironmentVariable("SDMS_STORAGE_CONNSTR")!;

        opts.QueueName ??= Environment.GetEnvironmentVariable("SDMS_REDIS_QUEUE_NAME")! ?? "sdms-queue-bulkdelete";

        opts.RedisQueueHostname ??= Environment.GetEnvironmentVariable("SDMS_REDIS_QUEUE_HOSTNAME")!;
        opts.RedisQueuePassword ??= Environment.GetEnvironmentVariable("SDMS_REDIS_QUEUE_PASSWORD")!;
        opts.RedisQueuePort ??= Environment.GetEnvironmentVariable("SDMS_REDIS_QUEUE_PORT")!;

        opts.RedisLocksHostname ??= Environment.GetEnvironmentVariable("SDMS_REDIS_LOCKS_HOSTNAME")!;
        opts.RedisLocksPassword ??= Environment.GetEnvironmentVariable("SDMS_REDIS_LOCKS_PASSWORD")!;
        opts.RedisLocksPort ??= Environment.GetEnvironmentVariable("SDMS_REDIS_LOCKS_PORT")!;

        opts.KeyVaultUrl ??= Environment.GetEnvironmentVariable("SDMS_KEYVAULT_URL")!;

        opts.DesUrl ??= Environment.GetEnvironmentVariable("DES_SERVICE_HOST")!;

        opts.AppInsightsInstrumentationKey ??= Environment.GetEnvironmentVariable("APPINSIGHTS_INSTRUMENTATION_KEY")!;
    }

    private static async Task AttemptOptionsFromKeyVaultAsync(Options opts)
    {
        var secretClient = new SecretClient(new Uri(opts.KeyVaultUrl), new DefaultAzureCredential());

        _logger?.LogInformation("Checking KeyVault variables for options...");
        var secretResponses = await Task.WhenAll(
            secretClient.GetSecretAsync(Constants.SecretNames.REDIS_LOCKS_HOSTNAME),
            secretClient.GetSecretAsync(Constants.SecretNames.REDIS_LOCKS_PASSWORD),
            secretClient.GetSecretAsync(Constants.SecretNames.REDIS_SHARED_HOSTNAME),
            secretClient.GetSecretAsync(Constants.SecretNames.REDIS_SHARED_PASSWORD),
            secretClient.GetSecretAsync(Constants.SecretNames.APP_RESOURCE_ID),
            secretClient.GetSecretAsync(Constants.SecretNames.APP_INSIGHTS_INSTRUMENTATION_KEY));

        _logger?.LogInformation("Got variables from Key Vault...");

        var secrets = secretResponses.Select(s => s.Value.Value).ToArray();

        opts.RedisLocksHostname ??= secrets[0];
        opts.RedisLocksPassword ??= secrets[1];
        opts.RedisQueueHostname ??= secrets[2];
        opts.RedisQueuePassword ??= secrets[3];
        opts.AppResourceId ??= secrets[4];
        opts.AppInsightsInstrumentationKey ??= secrets[5];
    }

    private static async Task RunAsync(Options opts)
    {
        var webApplicationBuilder = WebApplication.CreateBuilder();

        ConfigureServices(webApplicationBuilder.Services, opts);

        _ = webApplicationBuilder.Logging
            .ClearProviders()
            .AddSimpleConsole(o =>
            {
                o.SingleLine = true;
                o.TimestampFormat = "[HH:mm:ss:fff] ";
            })
            .AddApplicationInsights(
            configureTelemetryConfiguration: (config) =>
#pragma warning disable CS0618 // Type or member is obsolete
               config.InstrumentationKey = opts.AppInsightsInstrumentationKey, //this is for adding traces in the App Insights
#pragma warning restore CS0618 // Type or member is obsolete
                configureApplicationInsightsLoggerOptions: (options) => { }
            ).
            AddFilter<ApplicationInsightsLoggerProvider>("", LogLevel.Debug);

        var localUrl = $"http://0.0.0.0:{opts.WebHostPort}";
        _ = webApplicationBuilder.WebHost.UseUrls(localUrl);
        _logger?.LogInformation("Application will bind to {LocalUrl}", localUrl);

        var webapp = webApplicationBuilder.Build();

        _ = webapp.UseHealthChecks("/healthz");

        await webapp.RunAsync();
    }

    private static void ConfigureServices(IServiceCollection services, Options opts)
    {
        services.AddAzureClients(builder =>
        {
            _ = builder.AddSecretClient(new Uri(opts.KeyVaultUrl));
        });

        // From the local machine, the user is expected to az login and have access to all dependencies
        // such as Key Vault, CosmosDB, Storage accounts.
        // When deployed, there will be a pod identity with access to these dependencies.
        // DefaultAzureCredential works in both cases.
        _ = services.AddSingleton<TokenCredential, DefaultAzureCredential>();

        _ = services.AddSingleton<HttpClient>();

        if (!string.IsNullOrEmpty(opts.DesUrl))
        {
            _ = services
                .AddSingleton<DesClient>()
                .AddSingleton<IDesClient>(
                    sp => new CachingDesClient(sp.GetRequiredService<DesClient>()));
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
            .AddSingleton<BlobClientFactory>()
            .AddSingleton<IBlobClientFactory>(
                sp => new CachingBlobClientFactory(sp.GetRequiredService<BlobClientFactory>()));

        _ = services
            .AddSingleton<IOptions>(opts)
            .AddSingleton<IOptionsCosmos>(sp => sp.GetRequiredService<IOptions>())
            .AddSingleton<IOptionsQueueRedis>(sp => sp.GetRequiredService<IOptions>())
            .AddSingleton<IOptionsLocksRedis>(sp => sp.GetRequiredService<IOptions>())
            .AddSingleton<IOptionsStorageAccount>(sp => sp.GetRequiredService<IOptions>())
            .AddSingleton<IOptionsQueueRedisQueueName>(sp => sp.GetRequiredService<IOptions>())
            .AddSingleton<IOptionsDataEcosystemService>(sp => sp.GetRequiredService<IOptions>())
            .AddSingleton<TaskQueueBackgroundServiceOptions>(new TaskQueueBackgroundServiceOptions
            {
                DelayWhenTaskNotFound = TimeSpan.FromSeconds(5),
            })
            .AddSingleton<ICachingConnectionMultiplexerFactory, CachingConnectionMultiplexerFactory>()
            .AddSingleton<IRedisConnectionFactory, RedisConnectionFactory>()
            .AddSingleton<IItemsRetriever, DeleteItemsRetriever>()
            .AddSingleton<IMetadataDeletionWorker, MetadataDeletionWorker>()
            .AddSingleton<IBlobClientFactory, BlobClientFactory>()
            .AddSingleton<IBulkDeletionWorker, BulkDeletionWorker>()
            .AddSingleton<DeletionTaskHashEntriesDeserializer>()
            .AddSingleton<DeletionTaskExecutor>()
            .AddSingleton<RedisListWorker<
                IDeletionOperationMessage,
                DeletionTaskHashEntriesDeserializer,
                DeletionTaskExecutor
            >>()
            .AddHostedService<TaskQueueBackgroundService<
                RedisListWorker<
                    IDeletionOperationMessage,
                    DeletionTaskHashEntriesDeserializer,
                    DeletionTaskExecutor
                >
            >>()
            .AddSingleton<IDeletionTaskStatusStorage, RedisDeletionTaskStatusStorage>()
            .AddSingleton<ILockManager, LockManager>()
            .AddSingleton<IDataAccess, Cosmos>();

        _ = services
            .AddHealthChecks()
            .AddCheck<TaskQueueExistenceCheck>(
                "task-queue-existence-check",
                timeout: TimeSpan.FromMinutes(1))
            .AddRedis(
                sp => sp.GetRequiredService<RedisConnectionFactory>().GetRedisForLocks().GetConnection(),
                name: "redis-locks-connectivity-check",
                timeout: TimeSpan.FromMinutes(1))
            .AddRedis(
                sp => sp.GetRequiredService<RedisConnectionFactory>().GetRedisForQueue().GetConnection(),
                name: "redis-queue-connectivity-check",
                timeout: TimeSpan.FromMinutes(1));

        //this is for adding dependencies in the App Insights
#pragma warning disable CS0618 // Type or member is obsolete
        var options = new ApplicationInsightsServiceOptions { InstrumentationKey = opts.AppInsightsInstrumentationKey };
#pragma warning restore CS0618 // Type or member is obsolete
        _ = services.AddApplicationInsightsTelemetry(options: options);

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
            await AttemptOptionsFromKeyVaultAsync(opts);

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
