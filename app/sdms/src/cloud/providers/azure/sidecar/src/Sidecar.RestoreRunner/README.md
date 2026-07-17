# Restore Operation Runner

This project provides the Azure implementation for the long-running **restore** operation, which is
responsible for restoring a dataset (its blobs and its Cosmos DB metadata) to a chosen
point in time (PITR — Point In Time Restore).

## Overview

Restoring a dataset can be a long-running operation which requires the process to run
asynchronously. There are a number of tasks that need to be handled during the operation,
including the following:

- Queuing restore requests from the front-facing API (Azure Storage Queue).
- Dequeuing requests in the backend.
- Reporting the status of the restore operation (Cosmos DB).
- Locking the dataset for the duration of the restore (Redis distributed lock).
- Resolving the storage location and the correct version of the dataset for the requested restore point.
- Restoring the associated blobs to the requested point in time (Azure Blob point-in-time restore).
- Restoring / finalizing the associated metadata in Cosmos DB.
- Validating consistency between the restored blobs and the restored metadata.
- Unlocking the dataset after the restore completes.

The restore request flows through the following seams:

```text
raw Storage-Queue payload (JSON)
   -> RestoreJsonDeserializer            (parses the request message)
   -> IRestoreOperationMessage
   -> RestoreTaskExecutor.ProcessAsync   (orchestrates the 8-stage restore)
```

As the process runs in the background and can take a long time, the restore operation reports the
status of the long-running operation in Cosmos DB.

## Developer Tips

This project provides an [.env.example](.env.example) file that provides the base environment
variables needed to run/debug the service. Copy it to a local `.env` file (which is git-ignored)
and fill in the values for your deployment.

| Name | Description | Example |
|------|-------------|---------|
| __HOST_PORT__ | On which local port to expose the health-check endpoint (`/healthz`). Optional; defaults to `6000`. | `6000` |
| __SDMS_KEYVAULT_URL__ | Required. Key Vault URL that stores secret values for all partitions (Cosmos, Redis, storage account) and the Application Resource Id. Redis hostnames/passwords and the central storage-queue endpoint are read from here when not supplied as env vars. | `https://kv-4e37ckkpdir6i.vault.azure.net/` |
| __AZURE_SUBSCRIPTION_ID__ | Required. Subscription that hosts the SDMS storage accounts. Used by the resource resolver (ARM) to discover the storage account for a data partition. | `00000000-0000-0000-0000-000000000000` |
| __AZURE_RESOURCE_GROUP__ | Required. Resource group that holds the SDMS storage accounts. Used together with the subscription id to resolve the storage account. | `rg-sdms-xxxxx` |
| __DES_SERVICE_HOST__ | If supplied, the service calls the DES instance to retrieve the deployment/tenant (data-partition-id) connection values. If omitted, provide the Cosmos and storage connection values directly (see below). | `https://sdmstest00.oep.ppe.azure-int.net` |
| __SDMS_RESTORE_QUEUE__ | The name of the Azure Storage Queue used for submitting restore tasks. Optional; defaults to `restore-queue`. | `restore-queue` |
| __CENTRAL_STORAGE_QUEUE_ENDPOINT__ | The endpoint of the Storage Queue service that holds the restore queue. Optional; read from Key Vault when not supplied. | `https://xxxxx.queue.core.windows.net/` |
| __SDMS_COSMOS_ENDPOINT__ | The URL for the Cosmos instance that stores the SDMS metadata. Required if __DES_SERVICE_HOST__ is not supplied. | `https://db-xxx.documents.azure.com:443/` |
| __SDMS_COSMOS_KEY__ | The key for the Cosmos instance. Required if __DES_SERVICE_HOST__ is not supplied. | `primary/secondary Cosmos key` |
| __SDMS_STORAGE_ACCOUNT_NAME__ | The name of the Azure Storage account used to hold the datasets. Required if __DES_SERVICE_HOST__ is not supplied. | `sdmsstoragexxxxx` |
| __SDMS_STORAGE_CONNSTR__ | The connection string for the Azure Storage account used to hold the datasets. Required if __DES_SERVICE_HOST__ is not supplied. | `DefaultEndpointsProtocol=https;AccountName=some-account;AccountKey=some_account_key;EndpointSuffix=core.windows.net` |
| __SDMS_REDIS_LOCKS_HOSTNAME__ | Host of the Redis instance that handles the dataset locks. In the typical Azure deployment this Redis instance starts with the prefix `queue`. Optional; read from Key Vault when not supplied. | `queue-xxxxx.redis.cache.windows.net` |
| __SDMS_REDIS_LOCKS_PASSWORD__ | Password for the Redis instance that handles the dataset locks. Optional; read from Key Vault when not supplied. | `password` |
| __SDMS_REDIS_LOCKS_PORT__ | Port for the locks Redis instance. Optional; defaults to `6380`. | `6380` |
| __SDMS_REDIS_QUEUE_HOSTNAME__ | Host of the shared/queue Redis instance. In the typical Azure deployment this Redis instance starts with the prefix `cache`. Optional; read from Key Vault when not supplied. | `cache-xxxxx.redis.cache.windows.net` |
| __SDMS_REDIS_QUEUE_PASSWORD__ | Password for the queue Redis instance. Optional; read from Key Vault when not supplied. | `password` |
| __SDMS_REDIS_QUEUE_PORT__ | Port for the queue Redis instance. Optional; defaults to `6380`. | `6380` |
| __AZURE_MSI_ISENABLED__ | Set to `true` when running under a Managed Identity so Redis authenticates via AAD. Optional; defaults to disabled. | `false` |
| __REDIS_CLIENT_ID__ | The client id of the Managed Identity used for Redis AAD auth. Only used when __AZURE_MSI_ISENABLED__ is `true`. | `00000000-0000-0000-0000-000000000000` |
| __AZURE_CLIENT_ID__ | The Application (Client) Id under which the service runs. The App Registration (Service Principal) must have access to the deployed SDMS Azure resources. Optional; picked up by `DefaultAzureCredential`. More info: [Azure Identity](https://learn.microsoft.com/dotnet/api/azure.identity.environmentcredential?view=azure-dotnet). | `00000000-0000-0000-0000-000000000000` |
| __AZURE_CLIENT_SECRET__ | The secret for the Application (Client). Optional; picked up by `DefaultAzureCredential`. | `some_secret_key` |
| __AZURE_TENANT_ID__ | The Azure Tenant Id of the deployment. Optional; picked up by `DefaultAzureCredential`. | `00000000-0000-0000-0000-000000000000` |
| __Logging__LogLevel__Default__ | Logging level for the logging provider. Optional; overrides the default level. More info: [Logging](https://learn.microsoft.com/dotnet/core/extensions/logging?tabs=command-line#set-log-level-by-command-line-environment-variables-and-other-configuration). | `1` |

### Authentication

The service uses [`DefaultAzureCredential`](https://learn.microsoft.com/dotnet/api/azure.identity.defaultazurecredential).

- **Local development:** sign in with the Azure CLI (`az login`) and the credential will pick up your
  CLI identity automatically, or supply `AZURE_CLIENT_ID` / `AZURE_CLIENT_SECRET` / `AZURE_TENANT_ID`
  for a Service Principal.
- **Production:** the credential automatically uses the assigned Managed Identity — no code changes
  are needed, only the correct role assignments on the SDMS Azure resources.

### Example configurations

The values below mirror a typical Azure deployment. When `DES_SERVICE_HOST` is supplied, the DES
service provides the connection values for the Cosmos instance and the storage account.

```bash
SDMS_KEYVAULT_URL='https://kv-xxx.vault.azure.net/'
DES_SERVICE_HOST='https://sdmstest.oep.ppe.azure-int.net'
AZURE_SUBSCRIPTION_ID='00000000-0000-0000-0000-000000000000'
AZURE_RESOURCE_GROUP='rg-sdms-xxxxx'
SDMS_RESTORE_QUEUE='restore-queue'
Logging__LogLevel__Debug=1
AZURE_CLIENT_ID='00000000-0000-0000-0000-000000000000'
AZURE_CLIENT_SECRET='<client secret>'
AZURE_TENANT_ID='00000000-0000-0000-0000-000000000000'
```

To avoid the calls to the DES service while running locally, omit `DES_SERVICE_HOST` and supply the
Cosmos and storage connection values directly:

```bash
SDMS_KEYVAULT_URL='https://kv-xxx.vault.azure.net/'
AZURE_SUBSCRIPTION_ID='00000000-0000-0000-0000-000000000000'
AZURE_RESOURCE_GROUP='rg-sdms-xxxxx'
SDMS_RESTORE_QUEUE='restore-queue'
SDMS_COSMOS_KEY='<primary/secondary Cosmos Key>'
SDMS_COSMOS_ENDPOINT='https://db-xxx.documents.azure.com:443/'
SDMS_STORAGE_ACCOUNT_NAME='<storage account name>'
SDMS_STORAGE_CONNSTR='DefaultEndpointsProtocol=https;AccountName=<account name>;AccountKey=<some account key>;EndpointSuffix=core.windows.net'
Logging__LogLevel__Debug=1
```

You can also override the Redis connection values (otherwise they are read from Key Vault):

```bash
SDMS_REDIS_QUEUE_HOSTNAME='cache-xxx.redis.cache.windows.net'
SDMS_REDIS_QUEUE_PASSWORD='<some password>'
SDMS_REDIS_LOCKS_HOSTNAME='queue-xxx.redis.cache.windows.net'
SDMS_REDIS_LOCKS_PASSWORD='<some password>'
```

### How to find the DES Service URL

This value can be found using the following steps:

- In the Azure portal, find the Kubernetes Service for the SDMS deployment.
- In the blade, under `Kubernetes resources`, select `Configuration`.
- In the next blade, apply the `Filter by namespace` of `ddms-seismic`.
- Select `seismic-ddms-config` from the results.
- Under `Data`, retrieve the value for `DES_SERVICE_HOST`.

## Building and Running Locally

### Prerequisites

- [.NET SDK 8.0](https://dotnet.microsoft.com/download/dotnet/8.0) installed
- [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli) installed and signed in (`az login`)
- Access to a running SDMS Azure deployment (Key Vault, Cosmos DB, Redis, Storage) or the equivalent connection values

All commands below are run from the sidecar root directory:

```bash
cd app/sdms/src/cloud/providers/azure/sidecar
```

### Step 1: Restore and build the solution

```bash
# Build the whole solution (includes Sidecar.RestoreRunner)
dotnet build Sidecar.sln

# Or build only the Restore Runner project
dotnet build src/Sidecar.RestoreRunner/Sidecar.RestoreRunner.csproj
```

### Step 2: Run the tests

```bash
# Run all tests
dotnet test Sidecar.sln

# Or run only the Restore Runner tests
dotnet test test/Sidecar.RestoreRunner.Tests/Sidecar.RestoreRunner.Tests.csproj
```

### Step 3: Configure environment variables

Copy the example env file and fill in your deployment values:

```bash
cp src/Sidecar.RestoreRunner/.env.example src/Sidecar.RestoreRunner/.env
```

Then edit `src/Sidecar.RestoreRunner/.env` (see the table above for each variable).

### Step 4: Run the service

```bash
dotnet run --project src/Sidecar.RestoreRunner/Sidecar.RestoreRunner.csproj
```

The health-check endpoint is exposed at `http://localhost:<HOST_PORT>/healthz` (default port `6000`).
Once running, the service polls the restore Storage Queue and processes restore tasks as they arrive.

### VSCode Configuration Examples

To run and debug the application using VSCode, add the following configurations to `launch.json`
and `tasks.json` in the local `.vscode` folder.

#### launch.json

```json
{
    "version": "0.2.0",
    "configurations": [
        {
            "name": "Restore Operation Runner launcher",
            "type": "coreclr",
            "request": "launch",
            "preLaunchTask": "buildRestoreOperationRunner",
            "program": "${workspaceFolder}/src/Sidecar.RestoreRunner/bin/Debug/net8.0/Sidecar.RestoreRunner.dll",
            "args": [],
            "cwd": "${workspaceFolder}/src",
            "envFile": "${workspaceFolder}/src/Sidecar.RestoreRunner/.env",
            "console": "internalConsole",
            "stopAtEntry": false
        },
        {
            "name": ".NET Core Attach",
            "type": "coreclr",
            "request": "attach"
        }
    ]
}
```

#### tasks.json

```json
{
    "version": "2.0.0",
    "tasks": [
        {
            "label": "buildRestoreOperationRunner",
            "command": "dotnet",
            "type": "process",
            "args": [
                "build",
                "${workspaceFolder}/src/Sidecar.RestoreRunner/Sidecar.RestoreRunner.csproj",
                "/property:GenerateFullPaths=true",
                "/consoleloggerparameters:NoSummary"
            ],
            "problemMatcher": "$msCompile"
        },
        {
            "label": "publishRestoreOperationRunner",
            "command": "dotnet",
            "type": "process",
            "args": [
                "publish",
                "${workspaceFolder}/src/Sidecar.RestoreRunner/Sidecar.RestoreRunner.csproj",
                "/property:GenerateFullPaths=true",
                "/consoleloggerparameters:NoSummary"
            ],
            "problemMatcher": "$msCompile"
        },
        {
            "label": "watchRestoreOperationRunner",
            "command": "dotnet",
            "type": "process",
            "args": [
                "watch",
                "run",
                "--project",
                "${workspaceFolder}/src/Sidecar.RestoreRunner/Sidecar.RestoreRunner.csproj"
            ],
            "problemMatcher": "$msCompile"
        }
    ]
}
```

## Building the Docker Image

A [Dockerfile](Dockerfile) is provided to build the runtime container image. Build it from the
`src` directory so the build context includes the shared `Sidecar.Common` project referenced by the
Dockerfile:

```bash
cd app/sdms/src/cloud/providers/azure/sidecar/src

docker build -f Sidecar.RestoreRunner/Dockerfile -t sidecar-restore-runner:latest .
```

> Note: the build pulls NuGet packages from an authenticated Azure DevOps feed, so the build
> requires a `FEED_ACCESSTOKEN` build argument in environments that don't have the credential
> provider configured.
