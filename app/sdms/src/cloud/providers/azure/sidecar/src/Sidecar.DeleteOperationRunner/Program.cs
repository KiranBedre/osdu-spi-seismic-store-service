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

    private static void AttemptOptionsFromEnv(QueueOptionsRedis opts)
    {
        opts.ConnectionString ??= Environment.GetEnvironmentVariable("SDMS_REDIS_QUEUE_CONNSTR")!;
        opts.QueueName ??= Environment.GetEnvironmentVariable("SDMS_REDIS_QUEUE_NAME")!;
    }

    private static async Task RunAsync(QueueOptionsRedis opts)
    {
        var host = Host.CreateDefaultBuilder()
            .ConfigureServices(services => _ = services
                .AddSingleton<IQueueOptionsRedis>(opts)
                .AddSingleton<IQueueHandlerDeletion<IQueueOptionsRedis, IDeleteOperationMessage>,QueueHandlerRedisDeletion>()
                .AddHostedService<DeletionOperationService<IQueueOptionsRedis, IDeleteOperationStatus>>()

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

        var res = parser.ParseArguments<QueueOptionsRedis>(args);

        //---if parsing did not succeed, try to read from env for values instead
        if (res.Errors.Any())
        {
            Logger?.LogWarning("Checking environment variables for options...");
            var opts = res.Value ?? new QueueOptionsRedis();
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
        _ = await parser.ParseArguments<QueueOptionsRedis>(args)
            .WithNotParsed(HandleOptionsParserError)
            .WithParsedAsync(RunAsync);
    }
}