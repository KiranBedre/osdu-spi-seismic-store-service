# Sidecar Query Runner

This is a sidecar container for running queries against a database and writing the results to a file.
It is required as the javascript sdk does not allow to run cross partition queries with continuation tokens.
You can achieve cross partition queries with continuation token support by using Side car pattern. (<https://github.com/Azure/azure-sdk-for-js/blob/main/sdk/cosmosdb/cosmos/README.md#workarounds>)

## Developer Tips

This project provides an [.env.example](.env.example) file that provides the base environment variables needed to run/debug the service.

| Name                              | Description  |
| ---| --- |
| __KEYVAULT_URL__               | Required. The Keyvault stores secret values for all partitions, for example AppInsights Instrumentation Key |
