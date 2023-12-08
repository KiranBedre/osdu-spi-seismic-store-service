using Azure.Identity;
using Azure.Security.KeyVault.Secrets;
using Microsoft.ApplicationInsights.AspNetCore.Extensions;
using Sidecar.Common.Utility;
using Sidecar.QueryRunner;

var builder = WebApplication.CreateBuilder(args);

var opts = ConfigureOptions();

ConfigureServices(builder, opts);

var app = builder.Build();

ConfigureApp(app);

app.Run();

OptionsQueryRunner ConfigureOptions()
{
    var opts = new OptionsQueryRunner();
    opts.KeyVaultUrl ??= Environment.GetEnvironmentVariable("KEYVAULT_URL")!;
    opts.AppInsightsInstrumentationKey ??= Environment.GetEnvironmentVariable("APPINSIGHTS_INSTRUMENTATION_KEY")!;
    if (string.IsNullOrEmpty(opts.AppInsightsInstrumentationKey))
    {
        var url = opts.KeyVaultUrl.StartsWith("https") ? opts.KeyVaultUrl : $"https://{opts.KeyVaultUrl}.vault.azure.net";
        var secretClient = new SecretClient(new Uri(url), new DefaultAzureCredential());
        var secretResponse = secretClient.GetSecretAsync(Constants.SecretNames.APP_INSIGHTS_INSTRUMENTATION_KEY).Result;
        opts.AppInsightsInstrumentationKey = secretResponse.Value.Value;
    }
    return opts;
}

void ConfigureServices(WebApplicationBuilder builder, OptionsQueryRunner opts)
{
    var aioptions = new ApplicationInsightsServiceOptions
    {
#pragma warning disable CS0618 // Type or member is obsolete
        InstrumentationKey = opts.AppInsightsInstrumentationKey,
        EnableHeartbeat = true,
        EnableDebugLogger = true,
    };
    _ = builder.Services.AddApplicationInsightsTelemetry(aioptions);
    _ = builder.Services.AddControllers();
    _ = builder.Services.AddEndpointsApiExplorer();
    _ = builder.Services.AddSwaggerGen();
    _ = builder.Services.AddScoped<IDataAccess, Cosmos>();
}

void ConfigureApp(WebApplication app)
{
    if (app.Environment.IsDevelopment())
    {
        _ = app.UseSwagger();
        _ = app.UseSwaggerUI();
    }

    _ = app.UseHttpsRedirection();
    _ = app.UseAuthorization();
    _ = app.MapControllers();
}
