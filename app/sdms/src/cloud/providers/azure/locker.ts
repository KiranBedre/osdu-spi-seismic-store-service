// ============================================================================
// Copyright 2017-2026, Microsoft Corporation
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

import { Locker } from '../../../services/dataset/locker';
import { Config } from '../..';
import { RedisMsiConnectionManager } from './redis-msi-connection-manager';
import { AzureConfig } from './config';

/**
 * Azure-specific Locker implementation with MSI authentication support.
 * Extends the base Locker class to provide Azure-specific Redis client initialization.
 */
export class AzureLocker extends Locker {

    private static readonly CONNECTION_NAME_MAIN = 'sdms-locker';
    private static readonly CONNECTION_NAME_SUBSCRIPTION = 'sdms-locker-subscription';

    private get msiConnectionManager(): RedisMsiConnectionManager {
        return RedisMsiConnectionManager.getInstance();
    }

    public async init() {
        // If MSI is not enabled or in unit test mode, use base Locker implementation
        if (!AzureConfig.shouldUseMsiAuth()) {
            return super.init();
        }

        const baseRedisOptions = this.createBaseRedisOptions();

        // Helper to create a Redis client with shared config
        const createClient = (connectionName: string, isPeriodicAuthEnabled: boolean) =>
            this.msiConnectionManager.initializeRedisClient(
                Config.LOCKSMAP_REDIS_INSTANCE_ADDRESS,
                Config.LOCKSMAP_REDIS_INSTANCE_PORT,
                Config.LOCKSMAP_REDIS_INSTANCE_TLS_DISABLE,
                connectionName,
                this.constructor.name,
                baseRedisOptions,
                isPeriodicAuthEnabled
            );

        // Create and initialize both Redis clients
        // Note: subscription client is in pub/sub mode, cannot receive periodic AUTH
        [this.redisClient, this.redisSubscriptionClient] = await Promise.all([
            createClient(AzureLocker.CONNECTION_NAME_MAIN, true),         // Regular client - enable periodic AUTH
            createClient(AzureLocker.CONNECTION_NAME_SUBSCRIPTION, false) // Pub/sub subscriber - disable periodic AUTH
        ]);

        // Setup event handlers and initialize Redlock (inherited methods)
        this.setupEventHandlers();
        this.initializeRedlock();
    }

    /**
     * Cleanup method for graceful shutdown
     */
    public async cleanup(): Promise<void> {
        // Disconnect Redis clients
        if (this.redisClient) {
            await this.redisClient.disconnect();
        }
        if (this.redisSubscriptionClient) {
            await this.redisSubscriptionClient.disconnect();
        }
    }
}

// Singleton instance for Azure-specific locker
export const azureLockerInstance = new AzureLocker();
