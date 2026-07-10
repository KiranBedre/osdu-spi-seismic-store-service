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

import Redis, { RedisOptions } from 'ioredis';
import { StorageJobManager } from '../../shared/queue';
import { RedisMsiConnectionManager } from './redis-msi-connection-manager';
import { AzureConfig } from './config';
import { Config, LoggerFactory } from '../..';

/**
 * Azure-specific implementation of StorageJobManager with MSI authentication support
 */
export class AzureStorageJobManager extends StorageJobManager {

    private static readonly CONNECTION_NAME_PREFIX = 'sdms-copy-agent';

    private get msiConnectionManager(): RedisMsiConnectionManager {
        return RedisMsiConnectionManager.getInstance();
    }

    private readonly logger = Config.CLOUDPROVIDER ? LoggerFactory.build(Config.CLOUDPROVIDER) : console;
    private host: string = '';
    private port: number = 0;
    private disableTls: boolean = false;

    public async setup(
        cacheParams: {
            ADDRESS: string;
            PORT: number;
            KEY?: string;
            DISABLE_TLS?: boolean;
        }
    ) {
        // If MSI is not enabled or in unit test mode, use base class implementation
        if (!AzureConfig.shouldUseMsiAuth()) {
            return super.setup(cacheParams);
        }

        // Store connection params for client factory
        this.host = cacheParams.ADDRESS;
        this.port = cacheParams.PORT;
        this.disableTls = cacheParams.DISABLE_TLS || false;

        // Setup Bull queue with client factory
        await this.setupQueueWithMsiClientFactory();
    }

    /**
     * Sets up Bull queue with a custom client factory for MSI authentication
     * Bull creates 3 Redis clients internally, we provide them all with MSI auth
     */
    private async setupQueueWithMsiClientFactory(): Promise<void> {
        const Bull = (await import('bull')).default;

        // Create all 3 Bull clients and wait for them to be ready BEFORE passing to Bull
        // This eliminates race conditions and the need for enableOfflineQueue
        const [clientMain, clientSubscriber, clientBlocking] = await Promise.all([
            this.createRedisBullClient('client', 1),
            this.createRedisBullClient('subscriber', 2),
            this.createRedisBullClient('bclient', 3)
        ]);

        this.copyJobsQueue = new Bull('copyjobqueue', {
            createClient: (type: 'client' | 'subscriber' | 'bclient') => {
                switch (type) {
                    case 'client': return clientMain;
                    case 'subscriber': return clientSubscriber;
                    case 'bclient': return clientBlocking;
                }
            },
            limiter: {
                max: this.COPY_QUEUE_LIMIT_MAX,
                duration: this.COPY_QUEUE_LIMIT_DURATION_MS
            }
        });

        // setup job processing callback
        this.copyJobsQueue.process(this.COPY_QUEUE_CONCURRENCY, (input) => {
            return this.copy(input);
        }).catch(
            (error) => { this.logger.error('[AzureStorageJobManager] Bull process error: ' + JSON.stringify(error));
        });

        // setup handlers for job events
        this.setupEventHandlers();
    }

    /**
     * Creates a fully connected and authenticated Redis client for Bull
     */
    private async createRedisBullClient(type: 'client' | 'subscriber' | 'bclient', counter: number): Promise<Redis> {
        const connectionName = `${AzureStorageJobManager.CONNECTION_NAME_PREFIX}-${type}-${counter}`;
        const isRegularClient = type === 'client';

        // Bull requires bclient/subscriber to NOT have maxRetriesPerRequest or enableReadyCheck
        // See: https://github.com/OptimalBits/bull/issues/1873

        // IMPORTANT: Do NOT set commandTimeout on bclient/subscriber
        // - subscriber blocks on SUBSCRIBE listening for events
        // - bclient blocks on BRPOP waiting for jobs (can wait indefinitely)
        // - Setting commandTimeout breaks Bull's blocking operations
        const baseOptions: Partial<RedisOptions> = {
            maxRetriesPerRequest: isRegularClient ? 10 : null,
            enableReadyCheck: isRegularClient
        };

        // Use centralized client initialization - handles connection, auth, event handlers, and registration
        // Note: Periodic AUTH is disabled for subscriber (pub/sub mode) and bclient (blocking on BRPOP)
        // as these clients cannot accept AUTH commands while in their special modes
        return await this.msiConnectionManager.initializeRedisClient(
            this.host,
            this.port,
            this.disableTls,
            connectionName,
            this.constructor.name,
            baseOptions,
            isRegularClient // Only regular client can handle periodic AUTH
        );
    }

    /**
     * Cleanup method for graceful shutdown
     */
    public async cleanup() {
        // Close Bull queue (which will disconnect its Redis clients)
        if (this.copyJobsQueue) {
            await this.copyJobsQueue.close();
        }
    }
}

// Singleton instance for Azure storage job manager
export const azureStorageJobManagerInstance = new AzureStorageJobManager();
