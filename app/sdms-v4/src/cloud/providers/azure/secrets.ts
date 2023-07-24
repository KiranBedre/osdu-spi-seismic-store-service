// ============================================================================
// Copyright 2017-2023, Schlumberger
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

import { AbstractSecrets, SecretsFactory } from '../../secrets';
import { AzureConfig } from './config';
import { AzureCredentials } from './credentials';
import { Config } from '../../config';
import { SecretClient } from '@azure/keyvault-secrets';

@SecretsFactory.register('azure')
export class AzureSecrets extends AbstractSecrets {
    // Application Resource ID
    private static APP_RESOURCE_ID_KEY: string = 'aad-client-id';

    // Instrumentation key
    private static AI_INSTRUMENTATION_KEY = 'appinsights-key';

    // Redis keys
    public static REDIS_HOST = 'redis-hostname';
    public static REDIS_KEY = 'redis-password';

    public static CreateSecretClient(): SecretClient {
        const credential = AzureCredentials.getCredential();
        const vaultName = AzureConfig.KEYVAULT_URL!;
        const url = vaultName.startsWith('https') ? vaultName : `https://${vaultName}.vault.azure.net`;
        return new SecretClient(url!, credential);
    }

    public static async loadSecrets() {
        const client = AzureSecrets.CreateSecretClient();
        AzureConfig.APP_RESOURCE_ID = (await client.getSecret(this.APP_RESOURCE_ID_KEY)).value!;
        AzureConfig.AI_INSTRUMENTATION_KEY = (await client.getSecret(this.AI_INSTRUMENTATION_KEY)).value!;
        Config.REDIS_KEY = (Config.REDIS_KEY || (await client.getSecret(this.REDIS_KEY)).value)!;
        Config.REDIS_HOST = (Config.REDIS_HOST || (await client.getSecret(this.REDIS_HOST)).value)!;
    }

    public async getSecret(key: string): Promise<string> {
        return (await AzureSecrets.CreateSecretClient().getSecret(key)).value;
    }
}
