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
import { SDPath } from '../../../shared';

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
     * Checks if the archive container has any entries for the given dataset.
     * Used to determine if a deleted dataset can be restored.
     * @param sdPath - The sd:// dataset path (archive partition key).
     */
    public static async hasArchivedEntries(sdPath: string, tenant: string): Promise<boolean> {
        const archiveContainer = await AzureArchiveService.getContainer(tenant, AzureConfig.COSMOS_ARCHIVE_CONTAINER);
        const querySpec = {
            query: 'SELECT VALUE COUNT(1) FROM c WHERE c.sdPath = @sdPath',
            parameters: [{ name: '@sdPath', value: sdPath }]
        };
        const { resources } = await archiveContainer.items.query(querySpec, {
            partitionKey: sdPath
        }).fetchAll();
        return resources[0] > 0;
    }

    /**
     * Resolves the latest archivedAt (epoch ms) recorded for the given lifecycle. This equals the
     * live-window END of the most recently archived version, i.e. the instant the current
     * (soon-to-be-archived) version became live. Returns null when no predecessor has been archived
     * for this lifecycle (the current version is the first of its life).
     * @param archiveContainer - The archive container.
     * @param sdPath - The sd:// dataset path (archive partition key).
     * @param lifecycleKey - The datasetCreatedAtEpochMs lifecycle key.
     */
    private static async resolveLatestArchivedAtEpochMs(
        archiveContainer: any, sdPath: string, lifecycleKey: number): Promise<number | null> {
        const querySpec = {
            query: 'SELECT VALUE MAX(c.archivedAtEpochMs) FROM c'
                + ' WHERE c.sdPath = @sdPath AND c.datasetCreatedAtEpochMs = @lifecycleKey',
            parameters: [
                { name: '@sdPath', value: sdPath },
                { name: '@lifecycleKey', value: lifecycleKey }
            ]
        };
        const { resources } = await archiveContainer.items.query(querySpec, {
            partitionKey: sdPath
        }).fetchAll();
        return resources[0] ?? null;
    }

    /**
     * Returns a shallow copy of the Cosmos document with system properties (keys prefixed with '_')
     * removed, so the stored snapshot mirrors the { id, data } shape the restore readers expect.
     */
    private static stripSystemProperties(document: any): any {
        const clone = { ...document };
        for (const key of Object.keys(clone)) {
            if (key.startsWith('_')) {
                delete clone[key];
            }
        }
        return clone;
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
        const data = resource.data ?? {};
        // datasetCreatedAt: lifecycle key (created_date). Every version of THIS life shares it.
        const parsedCreatedAtEpochMs = data.created_date ? new Date(data.created_date).getTime() : 0;
        const datasetCreatedAtEpochMs = Number.isNaN(parsedCreatedAtEpochMs) ? 0 : parsedCreatedAtEpochMs;

        // Partition key: must be the sd:// dataset path the restore reader queries by, not the doc id.
        const sdPath = SDPath.build(data.tenant, data.subproject, data.path, data.name, datasetId);

        // versionCreatedAt: the version's live-window START = the instant this version became live =
        // the predecessor snapshot's archivedAt (millisecond-precise, same clock as archivedAt/blob
        // PITR). Sourcing it from the live doc's _ts (Unix SECONDS) would truncate to the second and
        // make consecutive windows [versionCreatedAt, archivedAt) overlap by up to 999 ms. The first
        // version of the lifecycle has no predecessor, so it falls back to the dataset's created date.
        const predecessorArchivedAtEpochMs = await AzureArchiveService.resolveLatestArchivedAtEpochMs(
            archiveContainer, sdPath, datasetCreatedAtEpochMs);
        const versionCreatedAtEpochMs = predecessorArchivedAtEpochMs ?? datasetCreatedAtEpochMs;

        // Store the full document ({ id, data }) so restore can read document.id and document.data.
        const document = AzureArchiveService.stripSystemProperties(resource);

        const archiveEntry = {
            id: `${datasetId}__${datasetCreatedAtEpochMs}__${timestamp}`,
            sdPath,
            archivedAtEpochMs: timestamp,
            operation,
            datasetCreatedAtEpochMs,
            versionCreatedAtEpochMs,
            document,
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
