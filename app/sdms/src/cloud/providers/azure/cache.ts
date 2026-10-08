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

import { Cache } from '../../../shared/cache';
import { RedisMsiConnectionManager } from './redis/redis-msi-connection-manager';
import { AzureConfig } from './config';

/**
 * Azure-specific cache implementation with MSI authentication support.
 * Extends the base Cache class and overrides init() to add MSI token handling.
 */
export class AzureCache extends Cache {

    private static readonly CONNECTION_NAME = 'sdms-shared-cache';

    public async init(
        host: string,
        port: number,
        password: string,
        disableTls: boolean,
        connectionName = AzureCache.CONNECTION_NAME): Promise<void> {

        // If MSI is not enabled or in unit test mode, use base class implementation
        if (!AzureConfig.shouldUseMsiAuth()) {
            return super.init(host, port, password, disableTls, connectionName);
        }

        if (host && port && !this.redisClient) {
            const baseOptions = this.createBaseRedisOptions(host, port, connectionName);
            const msiConnectionManager = RedisMsiConnectionManager.getInstance();

            this.redisClient = await msiConnectionManager.initializeRedisClient(
                host,
                port,
                disableTls,
                connectionName,
                this.constructor.name,
                baseOptions,
                true // Enable periodic AUTH for regular cache client
            );
        }
    }

    /**
     * Cleanup method for graceful shutdown
     */
    public async cleanup(): Promise<void> {
        if (this.redisClient) {
            await this.redisClient.disconnect();
        }
    }
}

export const azureCacheShared = new AzureCache();
