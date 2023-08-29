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

using CommandLine;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Sidecar.DeleteOperationRunner.Services;
using StackExchange.Redis;

public class Program
{
    private static ILogger<Program>? Logger;
    private static void HandleOptionsParserError(IEnumerable<Error> errs)
    {
        var errorMessage = errs.Select(err => err.ToString()).Where(x => x is not null)!.Aggregate((x, y) => x + Environment.NewLine + y);
        throw new ArgumentException(errorMessage);
    }

    private static void AttemptOptionsFromEnv(Options opts)
    {
        opts.QueueConnectionString ??= Environment.GetEnvironmentVariable("SDMS_REDIS_QUEUE_CONNSTR")!;
        opts.QueueName ??= Environment.GetEnvironmentVariable("SDMS_REDIS_QUEUE_NAME")!;
        
        opts.CosmosEndpoint ??= Environment.GetEnvironmentVariable("SDMS_COSMOS_ENDPOINT")!;
        opts.CosmosKey ??= Environment.GetEnvironmentVariable("SDMS_COSMOS_KEY")!;

        opts.StorageAccountConnectionString ??= Environment.GetEnvironmentVariable("SDMS_STORAGE_CONNSTR")!;

        opts.ConnectionString ??= Environment.GetEnvironmentVariable("SDMS_REDIS_LOCKS_CONNSTR")!;
    }

    private static async Task RunAsync(Options opts)
    {
        var host = Host.CreateDefaultBuilder()
           .ConfigureServices(services => _ = services
               .AddSingleton<IOptions>(opts)
               .AddSingleton<IOptionsCosmos>(sp => sp.GetService<IOptions>()!)
               .AddSingleton<IOptionsRedis>(sp => sp.GetService<IOptions>()!)
               .AddSingleton<IOptionsQueueRedis>(sp => sp.GetService<IOptions>()!)
               .AddSingleton<IOptionsStorageAccount>(sp => sp.GetService<IOptions>()!)
               .AddSingleton<IItemsRetriever, DeleteItemsRetriever>()
               .AddSingleton<IMetadataDeletionWorker, MetadataDeletionWorker>()
               .AddSingleton<IBlobClient, BlobClient>()
               .AddSingleton<IBulkDeletionWorker, BulkDeletionWorker>()
               .AddSingleton<IQueueHandlerDeletion, RedisHandlerDeletion>()
               .AddSingleton<IRedisHandler>(sp => sp.GetRequiredService<IQueueHandlerDeletion>())
               .AddSingleton<IConnectionMultiplexer>(sp => ConnectionMultiplexer.Connect(sp.GetService<IOptionsQueueRedis>()!.QueueConnectionString))
               .AddHostedService<DeletionOperationService>()
               .AddSingleton<ILockManager, LockManager>()

               .AddScoped<IDataAccess, Cosmos>()

            ).ConfigureLogging(lg => _ = lg
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

        Logger = loggerFactory.CreateLogger<Program>();

        var parser = new Parser(settings =>
        {
            settings.CaseInsensitiveEnumValues = true;
            settings.IgnoreUnknownArguments = true;
        });

        var res = parser.ParseArguments<Options>(args);

        //---if parsing did not succeed, try to read from env for values instead
        if (res.Errors.Any())
        {
            Logger?.LogWarning("Checking environment variables for options...");
            var opts = res.Value ?? new Options();
            AttemptOptionsFromEnv(opts);

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
