using CommandLine;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Sidecar.Common.Model;
using Sidecar.Common.Service;

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
    }

    private static async Task RunAsync(Options opts)
    {
        var host = Host.CreateDefaultBuilder()
           .ConfigureServices(services => _ = services
               .AddSingleton<IOptions>(opts)
               .AddSingleton<IOptionsCosmos>(sp => sp.GetService<IOptions>()!)
               .AddSingleton<IOptionsQueueRedis>(sp => sp.GetService<IOptions>()!)
               .AddSingleton<IOptionsStorageAcount>(sp => sp.GetService<IOptions>()!)
               .AddSingleton<IItemsRetriever<IOptionsCosmos>, ItemsRetriever>()
               //.AddSingleton<IBulkDeletionWorker<IOptions, IDeleteOperationStatus>>()
               .AddSingleton<IBulkDeletionWorker<IOptionsStorageAcount>, BulkDeletionWorker>()
               .AddSingleton<IQueueHandlerDeletion<IOptionsQueueRedis, IDeleteionOperationMessage>, QueueHandlerRedisDeletion>()
               .AddSingleton<IQueueHandler<IOptionsQueueRedis>>(sp => sp.GetRequiredService<IQueueHandlerDeletion<IOptionsQueueRedis, IDeleteionOperationMessage>>())
               .AddHostedService<DeletionOperationService<IOptionsStorageAcount, IOptionsQueueRedis, IOptionsCosmos, IDeleteOperationStatus>>()
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
