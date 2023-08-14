# Sidecar Query Runner

This is a sidecar container for running queries against a database and writing the results to a file.
It is required as the javascript sdk deos not allow to run cross partition queries with continuation tokens.
You can achieve cross partition queries with continuation token support by using Side car pattern. (https://github.com/Azure/azure-sdk-for-js/blob/main/sdk/cosmosdb/cosmos/README.md#workarounds)
