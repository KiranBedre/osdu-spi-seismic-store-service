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

import { CloudFactory } from './cloud';

export interface IConfig {
    init(): Promise<void>;
}

export abstract class Config implements IConfig {
    // Cloud provider name (anthos/aws/azure/google/ibm/...)
    public static CLOUD_PROVIDER: string;

    // Queue used for synchronizing v3 and v4 dataset
    public static SDMS_V3_V4_SYNC_QUEUE: string;

    // Sleep time for the watcher
    public static SDMS_VERSION_SYNC_INTERVAL = 5000;

    // Initialization methods
    public static setCloudProvider(cloudProvider: string | undefined) {
        if (!cloudProvider) {
            throw new Error(
                'The "CLOUD_PROVIDER" environment variable has not been set (required to start the server)'
            );
        }

        this.CLOUD_PROVIDER = cloudProvider;
    }

    // Load service configuration from environment.
    // In the init implementation, each CSP can override the default value
    public static async initialize(): Promise<void> {
        // Initialize the CSP specific configuration
        await ConfigFactory.build(Config.CLOUD_PROVIDER).init();

        Config.SDMS_V3_V4_SYNC_QUEUE = this.getEnvString('V3_V4_SYNC_QUEUE', 'sdms-queue-v3v4sync');
    }

    protected static getEnvString(key: string, defaultValue?: string): string {
        return process.env[key] ? process.env[key] : defaultValue ? defaultValue : undefined;
    }

    protected static checkRequiredConfig(config: any, name: string) {
        if (config === undefined || (typeof config === 'number' && isNaN(config))) {
            throw new Error('missing configuration: ' + name);
        }
    }

    // Must be implemented in the provider
    public abstract init(): Promise<void>;
}

export class ConfigFactory extends CloudFactory {
    public static build(providerLabel: string, args: { [key: string]: any } = {}): IConfig {
        return CloudFactory.build(providerLabel, Config, args) as IConfig;
    }
}
