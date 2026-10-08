// ============================================================================
// Copyright 2017-2025, Schlumberger
//
// Licensed under the Apache License, Version 2.0 (the "License");
// You may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// Distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// Limitations under the License.
// ============================================================================

import { AzureConfig } from './config';
import { Config } from '../../config';
import { DefaultAzureCredential } from '@azure/identity';
import { PartitionService } from '../../../shared';
import { SecretClient } from '@azure/keyvault-secrets';

export class AzureSecrets {
    // Storage queue
    public static STORAGE_QUEUE_ENDPOINT = 'queue-storage-endpoint';

    // Instrumentation key
    private static AI_INSTRUMENTATION_KEY = 'appinsights-key';

    public static DATA_PARTITION_COSMOS_ENDPOINT = 'cosmos-endpoint';
    public static DATA_PARTITION_COSMOS_PRIMARY_KEY = 'cosmos-primary-key';

    public static CreateSecretClient(): SecretClient {
        const credential = new DefaultAzureCredential();
        const vaultName = AzureConfig.KEYVAULT_URL!;
        const url = vaultName.startsWith('https') ? vaultName : `https://${vaultName}.vault.azure.net`;
        return new SecretClient(url!, credential);
    }

    public static async loadSecrets() {
        const client = AzureSecrets.CreateSecretClient();
        AzureConfig.AZURE_STORAGE_QUEUE_ENDPOINT = (await client.getSecret(this.STORAGE_QUEUE_ENDPOINT)).value!;
        AzureConfig.APP_RESOURCE_ID = (await client.getSecret(Config.APP_RESOURCE_ID)).value;
        AzureConfig.AZURE_CREDENTIAL = (
            await new DefaultAzureCredential().getToken(AzureConfig.APP_RESOURCE_ID + '/.default')
        ).token;
        AzureConfig.AI_INSTRUMENTATION_KEY = (await client.getSecret(this.AI_INSTRUMENTATION_KEY)).value!;
    }

    public static async getSecret(key: string): Promise<string> {
        return (await AzureSecrets.CreateSecretClient().getSecret(key)).value;
    }

    public static async getStorageResourceSecrets(dataPartition: string): Promise<string> {
        const dataPartitionConfigurations = await PartitionService.getPartitionConfiguration(
            dataPartition,
            AzureConfig.AZURE_CREDENTIAL
        );
        const storageConfigs = dataPartitionConfigurations[Config.CORE_SERVICE_PARTITION_STORAGE_ACCOUNT_KEY] as {
            sensitive: boolean;
            value: string;
        };
        if (storageConfigs.sensitive) {
            storageConfigs.value = await AzureSecrets.getSecret(storageConfigs.value);
        }
        return storageConfigs.value;
    }
}
