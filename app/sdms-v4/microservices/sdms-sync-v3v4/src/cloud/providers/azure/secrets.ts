// ============================================================================
// Copyright 2017-2024, Schlumberger
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
import { DefaultAzureCredential } from '@azure/identity';
import { SecretClient } from '@azure/keyvault-secrets';

export class AzureSecrets {
    // Storage queue
    public static STORAGE_QUEUE_ENDPOINT = 'queue-storage-endpoint';

    public static CreateSecretClient(): SecretClient {
        const credential = new DefaultAzureCredential();
        const vaultName = AzureConfig.KEYVAULT_URL!;
        const url = vaultName.startsWith('https') ? vaultName : `https://${vaultName}.vault.azure.net`;
        return new SecretClient(url!, credential);
    }

    public static async loadSecrets() {
        const client = AzureSecrets.CreateSecretClient();
        AzureConfig.AZURE_STORAGE_QUEUE_ENDPOINT = (await client.getSecret(this.STORAGE_QUEUE_ENDPOINT)).value!;
    }
}
