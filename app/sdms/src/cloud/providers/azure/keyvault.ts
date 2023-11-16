// ============================================================================
// Copyright 2017-2023, Schlumberger
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

import { SecretClient } from '@azure/keyvault-secrets';
import { AzureConfig } from './config';
import { AzureCredentials } from './credentials';

export class KeyVault {
    public static AI_INSTRUMENTATION_KEY = 'appinsights-key';
    public static REDIS_QUEUE_HOST = 'redis-queue-hostname';
    public static REDIS_QUEUE_KEY = 'redis-queue-password';
    public static REDIS_HOST = 'redis-hostname';
    public static REDIS_KEY = 'redis-password';
    public static STORAGE_QUEUE_ENDPOINT = 'queue-storage-endpoint';

    // pragma: allowlist nextline secret
    public static APP_RESOURCE_ID = 'aad-client-id';
    public static DATA_PARTITION_STORAGE_ACCOUNT_NAME = 'sdms-storage-account-name';
    public static DATA_PARTITION_COSMOS_ENDPOINT = 'cosmos-endpoint';
    public static DATA_PARTITION_COSMOS_PRIMARY_KEY = 'cosmos-primary-key';
    public static SERVICE_AUTH_PROVIDER_CREDENTIAL = 'sdms-svc-auth-provider-credential';

    // to restore when the impersonation token for azure will be implemented
    // public static IMP_SERVICE_ACCOUNT_SIGNER = 'imp-service-account-signer';

    public static CreateSecretClient(): SecretClient {
        const credential = AzureCredentials.getCredential();
        const vaultName = AzureConfig.KEYVAULT_URL;
        const url = vaultName.startsWith('https') ? vaultName : `https://${vaultName}.vault.azure.net`;
        const client = new SecretClient(url, credential);
        return client;
    }

    public static async loadSecrets(client: SecretClient) {

        // DefaultAzureCredential expects the following three environment variables:
        // - AZURE_TENANT_ID: The tenant ID in Azure Active Directory
        // - AZURE_CLIENT_ID: The application (client) ID registered in the AAD tenant
        // - AZURE_CLIENT_SECRET: The client secret for the registered application

        // insight instrumentation key
        AzureConfig.AI_INSTRUMENTATION_KEY = (await client.getSecret(this.AI_INSTRUMENTATION_KEY)).value;

        // Storage Queue endpoint
        try {
            AzureConfig.AZURE_STORAGE_QUEUE_ENDPOINT = (await client.getSecret(this.STORAGE_QUEUE_ENDPOINT)).value;
        } catch (error) {
            if (!(error && error['statusCode'] === 404 && error['code'] === 'SecretNotFound')) {
                throw error;
            }
        }

        // locksmap redis cache secret
        AzureConfig.LOCKSMAP_REDIS_INSTANCE_KEY = (await client.getSecret(this.REDIS_QUEUE_KEY)).value;
        AzureConfig.LOCKSMAP_REDIS_INSTANCE_ADDRESS = (await client.getSecret(this.REDIS_QUEUE_HOST)).value;

        // shared cache
        AzureConfig.REDIS_SHARED_INSTANCE_KEY = (await client.getSecret(this.REDIS_KEY)).value;
        AzureConfig.REDIS_SHARED_INSTANCE_ADDRESS = (await client.getSecret(this.REDIS_HOST)).value;

        try {
            AzureConfig.SERVICE_AUTH_PROVIDER_CREDENTIAL = (
                await client.getSecret(this.SERVICE_AUTH_PROVIDER_CREDENTIAL)).value;
        } catch (error) {
            if (!(error && error['statusCode'] && error['statusCode'] === 404)) {
                throw error;
            }
        }

        // application resource id
        AzureConfig.APP_RESOURCE_ID = (await client.getSecret(this.APP_RESOURCE_ID)).value;

    }
}
