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

import { Config, LoggerFactory } from '../..';
import { azureLockerInstance } from './locker';
import { azureCacheShared } from './cache';
import { azureStorageJobManagerInstance } from './queue';
import { azureOperationStatusStorage } from './operation-status-storage';
import { RedisMsiConnectionManager } from './redis/redis-msi-connection-manager';
import { setLockerInstance } from '../../../services/dataset/locker';
import { setOperationStatusStorage } from '../../../services/operation/status';
import { setStorageJobManagerInstance } from '../../shared/queue';
import { setCacheShared } from '../../../shared';
import { startServer } from '../../../server/server-start';

/**
 * Azure-specific server startup with MSI authentication support
 * Starts Azure singletons, then delegates to common server startup
 */
export async function startAzureServer(): Promise<void> {
    const logger = Config.CLOUDPROVIDER ? LoggerFactory.build(Config.CLOUDPROVIDER) : console;

    // Initialize Azure-specific service instances
    logger.info('- Initializing redis locker cache');
    setLockerInstance(azureLockerInstance);
    await azureLockerInstance.init();

    logger.info('- Initializing redis shared cache');
    setCacheShared(azureCacheShared);
    await azureCacheShared.init(
        Config.REDIS_SHARED_INSTANCE_ADDRESS,
        Config.REDIS_SHARED_INSTANCE_PORT,
        Config.REDIS_SHARED_INSTANCE_KEY,
        Config.REDIS_SHARED_INSTANCE_TLS_DISABLE
    );

    logger.info('- Initializing redis operations cache');
    setOperationStatusStorage(azureOperationStatusStorage);
    await azureOperationStatusStorage.init(
        Config.REDIS_SHARED_INSTANCE_ADDRESS,
        Config.REDIS_SHARED_INSTANCE_PORT,
        Config.REDIS_SHARED_INSTANCE_KEY,
        Config.REDIS_SHARED_INSTANCE_TLS_DISABLE
    );

    logger.info('- Initializing storage transfer daemon');
    setStorageJobManagerInstance(azureStorageJobManagerInstance);
    await azureStorageJobManagerInstance.setup({
        ADDRESS: Config.LOCKSMAP_REDIS_INSTANCE_ADDRESS,
        PORT: Config.LOCKSMAP_REDIS_INSTANCE_PORT,
        KEY: Config.LOCKSMAP_REDIS_INSTANCE_KEY,
        DISABLE_TLS: Config.LOCKSMAP_REDIS_INSTANCE_TLS_DISABLE
    });

    // Continue with common server startup (schema, swagger, server startup, etc.)
    await startServer();

    // Setup graceful shutdown handlers for Azure MSI cleanup
    setupGracefulShutdown(logger);
}

/**
 * Setup graceful shutdown handlers for Azure MSI token management
 */
function setupGracefulShutdown(logger: ReturnType<typeof LoggerFactory.build> | Console): void {
    const gracefulShutdown = async (signal: string) => {
        logger.info(`Graceful shutdown initiated by ${signal}`);

        try {
            // Cleanup Azure MSI connection manager
            await RedisMsiConnectionManager.getInstance().cleanup();

            if (azureStorageJobManagerInstance) {
                await azureStorageJobManagerInstance.cleanup();
            }

            if (azureLockerInstance) {
                await azureLockerInstance.cleanup();
            }

            if (azureCacheShared) {
                await azureCacheShared.cleanup();
            }

            if (azureOperationStatusStorage) {
                await azureOperationStatusStorage.cleanup();
            }

            logger.info('Graceful shutdown completed');
            process.exit(0);
        } catch (error) {
            logger.error(`Error during graceful shutdown: ${JSON.stringify(error)}`);
            process.exit(1);
        }
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}
