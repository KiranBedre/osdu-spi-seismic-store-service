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

import { Config, ConfigFactory } from '../../config';

import { AzureInsights } from './insights';
import { AzureSecrets } from './secrets';

@ConfigFactory.register('azure')
export class AzureConfig extends Config {
    // Application Resource ID
    public static APP_RESOURCE_ID: string;

    // Logs and Monitor
    public static AI_INSTRUMENTATION_KEY: string;

    // KeyVault Url
    public static KEYVAULT_URL: string;

    // Azure Storage Queue
    public static AZURE_STORAGE_QUEUE_ENDPOINT: string;

    public async init(): Promise<void> {
        // Load secrets
        AzureConfig.KEYVAULT_URL = process.env.KEYVAULT_URL;
        Config.checkRequiredConfig(AzureConfig.KEYVAULT_URL, 'KEYVAULT_URL');
        await AzureSecrets.loadSecrets();

        if (Config.FEATURE_FLAG_OPERATIONS_SYNC_V3_V4) {
            Config.checkRequiredConfig(AzureConfig.AZURE_STORAGE_QUEUE_ENDPOINT, 'AZURE_STORAGE_QUEUE_ENDPOINT');
        }

        // Initialize insights
        AzureInsights.initialize();
    }
}
