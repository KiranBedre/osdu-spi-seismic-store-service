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

import { OperationStatusStorage } from '../../../services/operation/status';
import { RedisMsiConnectionManager } from './redis-msi-connection-manager';
import { AzureConfig } from './config';

/**
 * Azure-specific operation status storage implementation with MSI authentication support.
 * Extends the base OperationStatusStorage class and overrides init() to add MSI token handling.
 */
export class AzureOperationStatusStorage extends OperationStatusStorage {

    private static readonly CONNECTION_NAME = 'sdms-operation-status';

    protected get msiConnectionManager(): RedisMsiConnectionManager {
        return RedisMsiConnectionManager.getInstance();
    }

    public async init(
        host: string,
        port: number,
        password: string,
        disableTls: boolean,
        connectionName = AzureOperationStatusStorage.CONNECTION_NAME): Promise<void> {

        // If MSI is not enabled or in unit test mode, use base class implementation
        if (!AzureConfig.shouldUseMsiAuth()) {
            return super.init(host, port, password, disableTls, connectionName);
        }

        if (host && port && !this.redisClient) {
            const baseOptions = this.createBaseRedisOptions(host, port, connectionName);

            this.redisClient = await this.msiConnectionManager.initializeRedisClient(
                host,
                port,
                disableTls,
                connectionName,
                this.constructor.name,
                baseOptions,
                true // Enable periodic AUTH for operation status storage
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

export const azureOperationStatusStorage = new AzureOperationStatusStorage();
