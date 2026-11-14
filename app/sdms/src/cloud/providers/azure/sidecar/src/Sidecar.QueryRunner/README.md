# Sidecar Query Runner

This is a sidecar container for running queries against a database and writing the results to a file.
It is required as the javascript sdk does not allow to run cross partition queries with continuation tokens.
You can achieve cross partition queries with continuation token support by using Side car pattern. (<https://github.com/Azure/azure-sdk-for-js/blob/main/sdk/cosmosdb/cosmos/README.md#workarounds>)

## Developer Tips

All sidecar services and their shared library/tests target .NET 10. Install the .NET 10 SDK;
the solution's `global.json` selects a stable .NET 10 feature band.
From the sidecar solution directory, run:

```sh
dotnet build Sidecar.sln -c Release
dotnet test Sidecar.sln -c Release --no-build
```

The service images use `mcr.microsoft.com/dotnet/sdk:10.0-noble` for builds and
`mcr.microsoft.com/dotnet/aspnet:10.0-noble` at runtime (Ubuntu 24.04), retaining non-root
UID/GID 5678. Existing configured ports and certificate settings are unchanged.
Run the existing SDMS end-to-end collections against an isolated deployment of the upgraded
images before rollout; the .NET test suite does not replace deployed integration tests.

This project provides an [.env.example](.env.example) file that provides the base environment variables needed to run/debug the service.

| Name                              | Description  |
| ---| --- |
| __KEYVAULT_URL__               | Required. The Keyvault stores secret values for all partitions, for example AppInsights Instrumentation Key |
