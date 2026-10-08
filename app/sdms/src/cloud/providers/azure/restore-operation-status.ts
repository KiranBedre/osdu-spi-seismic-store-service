// ============================================================================
// Copyright 2017-2026, Schlumberger, Microsoft Corporation
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

import { Container, CosmosClient } from '@azure/cosmos';
import { IRestoreOperationStatus } from '../../../services/operation/model';
import { AzureDataEcosystemServices } from './dataecosystem';
import { AzureConfig } from './config';
import { AzureCredentials } from './credentials';
import { Error } from '../../../shared';
import { Config, LoggerFactory } from '../..';

export class AzureRestoreOperationStatusStorage {

    private get logger() { return LoggerFactory.build(Config.CLOUDPROVIDER); }

    private static cosmosClientCache = new Map<string, Promise<CosmosClient>>();
    private static containerCache = new Map<string, Promise<Container>>();
    private static readonly CONTEXT = 'RestoreOperationStatusStorage';

    private getCosmosClient(tenant: string): Promise<CosmosClient> {
        if (!AzureRestoreOperationStatusStorage.cosmosClientCache.has(tenant)) {
            const clientPromise = (async () => {
                const endpoint = await AzureDataEcosystemServices.getCosmosConnectionEndpoint(tenant);
                return new CosmosClient({
                    endpoint,
                    aadCredentials: AzureCredentials.defaultAzureCredential
                });
            })().catch((err) => {
                AzureRestoreOperationStatusStorage.cosmosClientCache.delete(tenant);
                throw err;
            });
            AzureRestoreOperationStatusStorage.cosmosClientCache.set(tenant, clientPromise);
        }
        return AzureRestoreOperationStatusStorage.cosmosClientCache.get(tenant)!;
    }

    private getContainer(tenant: string): Promise<Container> {
        if (!AzureRestoreOperationStatusStorage.containerCache.has(tenant)) {
            const containerPromise = (async () => {
                const cosmosClient = await this.getCosmosClient(tenant);
                const database = cosmosClient.database(AzureConfig.COSMOS_DATABASE_ID);
                const container = database.container(AzureConfig.COSMOS_RESTORE_STATUS_CONTAINER);
                return container;
            })().catch((err) => {
                AzureRestoreOperationStatusStorage.containerCache.delete(tenant);
                throw err;
            });
            AzureRestoreOperationStatusStorage.containerCache.set(tenant, containerPromise);
        }
        return AzureRestoreOperationStatusStorage.containerCache.get(tenant)!;
    }

    public async createRestoreOperation(params: {
        operationId: string;
        tenant: string;
        subproject: string;
        sdPath: string;
        restorePointInTime: string;
        createdBy: string;
    }): Promise<void> {
        try {
            const container = await this.getContainer(params.tenant);

            const record = {
                id: params.operationId,
                operationId: params.operationId,
                tenant: params.tenant,
                subproject: params.subproject,
                sdPath: params.sdPath,
                restorePointInTime: params.restorePointInTime,
                createdBy: params.createdBy,
                status: 'Enqueued',
                errorDetails: undefined,
                startedAt: new Date().toISOString(),
                lastUpdatedAt: new Date().toISOString(),
            };

            await container.items.create(record);
        } catch (error) {
            this.logger.error({
                message: `Failed to create restore operation status: ${error?.message || error}`,
                context: AzureRestoreOperationStatusStorage.CONTEXT
            });
            throw Error.make(Error.Status.UNKNOWN,
                'Failed to create restore operation status: ' + (error as any).message);
        }
    }

    public async getRestoreOperationStatus(operationId: string, tenant: string): Promise<IRestoreOperationStatus> {
        if (!tenant) {
            throw Error.make(Error.Status.BAD_REQUEST, 'Tenant is required to fetch restore operation status');
        }

        const container = await this.getContainer(tenant);
        const { resource } = await container.item(operationId, operationId).read();

        if (!resource) {
            throw Error.make(Error.Status.NOT_FOUND, `Restore operation not found for operationId: '${operationId}'`);
        }

        return {
            operationId: resource.operationId,
            status: resource.status,
            sdPath: resource.sdPath,
            restorePointInTime: resource.restorePointInTime,
            tenant: resource.tenant,
            subproject: resource.subproject,
            createdBy: resource.createdBy,
            errorDetails: resource.errorDetails,
            startedAt: resource.startedAt,
            lastUpdatedAt: resource.lastUpdatedAt,
            completedAt: resource.completedAt,
        };
    }

    public async markRestoreOperationFailed(operationId: string, tenant: string, errorMessage: string): Promise<void> {
        const container = await this.getContainer(tenant);
        await container.item(operationId, operationId).patch([
            { op: 'replace', path: '/status', value: 'Failed' },
            { op: 'replace', path: '/errorDetails', value: errorMessage },
            { op: 'add', path: '/completedAt', value: new Date().toISOString() },
            { op: 'replace', path: '/lastUpdatedAt', value: new Date().toISOString() },
        ]);
    }

    /**
     * Secondary check: queries Cosmos for any active (non-terminal) restore in this data partition.
     * Used as a fallback when Redis lock state may be lost (e.g., Redis restart or lock TTL expiry).
     * A restore is considered active while its status is 'Enqueued' or 'InProgress'; both must block
     * a new restore so that an operation stuck at 'Enqueued' (never picked up by the sidecar) is not
     * silently overtaken once the Redis lock expires.
     * Returns the operationId if found, null otherwise.
     */
    public async getActiveRestoreOperationId(tenant: string): Promise<string | null> {
        const container = await this.getContainer(tenant);

        const query = {
            query: 'SELECT TOP 1 c.operationId FROM c WHERE c.status IN (@enqueued, @inProgress)',
            parameters: [
                { name: '@enqueued', value: 'Enqueued' },
                { name: '@inProgress', value: 'InProgress' }
            ]
        };

        const { resources } = await container.items.query(query).fetchAll();
        return resources.length > 0 ? resources[0].operationId : null;
    }
}
