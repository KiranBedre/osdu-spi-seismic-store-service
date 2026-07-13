// ============================================================================
// Copyright 2026, Microsoft Corporation
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
import { AzureDataEcosystemServices } from './dataecosystem';
import { AzureConfig } from './config';
import { AzureCredentials } from './credentials';
import { LoggerFactory } from '../../logger';

export enum ArchiveOperation {
    Patch = 'patch',
    BulkDelete = 'bulk_delete',
    ChangeTier = 'change_tier'
}

export class AzureArchiveService {

    private static get logger() { return LoggerFactory.getLogger(); }

    private static cosmosClientCache = new Map<string, Promise<CosmosClient>>();
    private static containerCache = new Map<string, Promise<Container>>();

    private static getCosmosClient(tenant: string): Promise<CosmosClient> {
        if (!AzureArchiveService.cosmosClientCache.has(tenant)) {
            const clientPromise = (async () => {
                const connectionParams = await AzureDataEcosystemServices.getCosmosConnectionParams(tenant);
                return new CosmosClient({
                    endpoint: connectionParams.endpoint,
                    aadCredentials: AzureCredentials.defaultAzureCredential
                });
            })().catch((err) => {
                AzureArchiveService.cosmosClientCache.delete(tenant);
                throw err;
            });
            AzureArchiveService.cosmosClientCache.set(tenant, clientPromise);
        }
        return AzureArchiveService.cosmosClientCache.get(tenant)!;
    }

    private static getContainer(tenant: string, containerId: string): Promise<Container> {
        const cacheKey = `${tenant}::${containerId}`;
        if (!AzureArchiveService.containerCache.has(cacheKey)) {
            const containerPromise = (async () => {
                const cosmosClient = await AzureArchiveService.getCosmosClient(tenant);
                return cosmosClient.database(AzureConfig.COSMOS_DATABASE_ID).container(containerId);
            })().catch((err) => {
                AzureArchiveService.containerCache.delete(cacheKey);
                throw err;
            });
            AzureArchiveService.containerCache.set(cacheKey, containerPromise);
        }
        return AzureArchiveService.containerCache.get(cacheKey)!;
    }

    /**
     * Archives the current state of a dataset before a save (upsert) operation.
     * Skips archival if the item doesn't exist yet (first write).
     */
    public static async archiveBeforeSave(datasetId: string, tenant: string): Promise<void> {
        await AzureArchiveService.archiveCurrentState(datasetId, tenant, ArchiveOperation.Patch);
    }

    /**
     * Archives a batch of datasets before a bulk delete operation.
     */
    public static async archiveBatch(datasetIds: string[], tenant: string): Promise<void> {
        const results = await Promise.allSettled(
            datasetIds.map(id => AzureArchiveService.archiveCurrentState(id, tenant, ArchiveOperation.BulkDelete))
        );

        const failures = results.filter(r => r.status === 'rejected');
        if (failures.length > 0) {
            const firstError = (failures[0] as PromiseRejectedResult).reason;
            AzureArchiveService.logger.error({
                message: `Archival batch failed: ${failures.length}/${datasetIds.length} items failed. First error: ${firstError?.message || firstError}`,
                context: 'ArchiveService.archiveBatch'
            });
            throw firstError;
        }
    }

    /**
     * Checks if the archive container has any entries for the given dataset ID.
     * Used to determine if a deleted dataset can be restored.
     */
    public static async hasArchivedEntries(datasetId: string, tenant: string): Promise<boolean> {
        const archiveContainer = await AzureArchiveService.getContainer(tenant, AzureConfig.COSMOS_ARCHIVE_CONTAINER);
        const querySpec = {
            query: 'SELECT VALUE COUNT(1) FROM c WHERE c.sdPath = @datasetId',
            parameters: [{ name: '@datasetId', value: datasetId }]
        };
        const { resources } = await archiveContainer.items.query(querySpec, {
            partitionKey: datasetId
        }).fetchAll();
        return resources[0] > 0;
    }

    private static async archiveCurrentState(datasetId: string, tenant: string, operation: ArchiveOperation): Promise<void> {
        const dataContainer = await AzureArchiveService.getContainer(tenant, AzureConfig.COSMOS_DATA_CONTAINER);

        // Read current state from primary data container
        const { resource } = await dataContainer.item(datasetId, datasetId).read();
        if (!resource) {
            // Item doesn't exist yet (first write) — nothing to archive
            return;
        }

        // Write snapshot to archive container
        const archiveContainer = await AzureArchiveService.getContainer(tenant, AzureConfig.COSMOS_ARCHIVE_CONTAINER);
        const timestamp = Date.now();
        const datasetCreatedAtEpochMs = resource.data?.created_date ? new Date(resource.data.created_date).getTime() : 0;
        const versionCreatedAtEpochMs = resource.data?.last_modified_date ? new Date(resource.data.last_modified_date).getTime() : 0;
        const archiveEntry = {
            id: `${datasetId}_${datasetCreatedAtEpochMs}_${timestamp}`,
            sdPath: datasetId,
            archivedAtEpochMs: timestamp,
            operation,
            datasetCreatedAtEpochMs,
            versionCreatedAtEpochMs,
            document: resource.data,
            ttl: AzureConfig.COSMOS_ARCHIVE_TTL_SECONDS
        };

        try {
            await archiveContainer.items.create(archiveEntry);
        } catch (error) {
            AzureArchiveService.logger.error({
                message: `Archival failed for dataset ${datasetId}: ${(error as any)?.message || error}`,
                context: 'ArchiveService.archiveCurrentState'
            });
            throw error;
        }
    }
}
