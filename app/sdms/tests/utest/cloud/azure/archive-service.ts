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

import sinon from 'sinon';
import { assert } from 'chai';
import { Container, CosmosClient, Database, Item, Items } from '@azure/cosmos';
import { AzureArchiveService } from '../../../../src/cloud/providers/azure/archive-service';
import { AzureDataEcosystemServices } from '../../../../src/cloud/providers/azure/dataecosystem';
import { AzureCredentials } from '../../../../src/cloud/providers/azure/credentials';
import { AzureConfig } from '../../../../src/cloud/providers/azure/config';
import { Tx } from '../../utils';

export class TestAzureArchiveService {
    private static sandbox: sinon.SinonSandbox;
    

    public static run() {
        describe(Tx.testInit('azure archive service tests'), () => {
            this.sandbox = sinon.createSandbox();
            

            beforeEach(() => {
                this.sandbox.stub(AzureDataEcosystemServices, 'getCosmosConnectionParams').resolves({
                    endpoint: 'https://test-cosmos.documents.azure.com:443/'
                });
                this.sandbox.stub(AzureCredentials, 'defaultAzureCredential').value({});
                this.sandbox.stub(AzureConfig, 'COSMOS_DATABASE_ID').value('sdms-db');
                this.sandbox.stub(AzureConfig, 'COSMOS_DATA_CONTAINER').value('data');
                this.sandbox.stub(AzureConfig, 'COSMOS_ARCHIVE_CONTAINER').value('ArchiveDatasetMetadata');
                this.sandbox.stub(AzureConfig, 'COSMOS_ARCHIVE_TTL_SECONDS').value(2592000);
            });

            afterEach(() => {
                this.sandbox.restore();
                // Clear cached clients/containers between tests
                (AzureArchiveService as any).cosmosClientCache = new Map();
                (AzureArchiveService as any).containerCache = new Map();
            });

            this.archiveBeforeSave_existingItem();
            this.archiveBeforeSave_newItem();
            this.archiveBeforeSave_failurePropagates();
            this.archiveBatch_allSucceed();
            this.archiveBatch_partialFailure();
        });
    }

    private static archiveBeforeSave_existingItem() {
        Tx.sectionInit('archiveBeforeSave - archives existing item');

        Tx.test(async () => {
            const existingData = { id: 'dataset-1', data: { name: 'test-dataset', status: 'active', created_date: 'Mon Jun 01 2026', last_modified_date: 'Tue Jun 15 2026' } };
            const readStub = this.sandbox.stub().resolves({ resource: existingData });
            const createStub = this.sandbox.stub().resolves({});

            this.sandbox.stub(CosmosClient.prototype, 'database').returns({
                container: (name: string) => {
                    if (name === 'data') {
                        return { item: () => ({ read: readStub }) } as any;
                    }
                    return { items: { create: createStub } } as any;
                }
            } as any);

            await AzureArchiveService.archiveBeforeSave('dataset-1', 'opendes');

            assert.isTrue(readStub.calledOnce, 'Should read current state from data container');
            assert.isTrue(createStub.calledOnce, 'Should create archive entry');

            const archiveEntry = createStub.firstCall.args[0];
            assert.equal(archiveEntry.sdPath, 'dataset-1');
            assert.equal(archiveEntry.operation, 'patch');
            assert.equal(archiveEntry.ttl, 2592000);
            assert.deepEqual(archiveEntry.document, existingData.data);
            assert.isNumber(archiveEntry.datasetCreatedAtEpochMs);
            assert.isAbove(archiveEntry.datasetCreatedAtEpochMs, 0);
            assert.isNumber(archiveEntry.versionCreatedAtEpochMs);
            assert.isAbove(archiveEntry.versionCreatedAtEpochMs, 0);
            assert.isNumber(archiveEntry.archivedAtEpochMs);
            assert.include(archiveEntry.id, 'dataset-1_');
            assert.include(archiveEntry.id, `_${archiveEntry.archivedAtEpochMs}`);
            assert.isUndefined(archiveEntry.archivedBy);
        });
    }

    private static archiveBeforeSave_newItem() {
        Tx.sectionInit('archiveBeforeSave - skips new item (404)');

        Tx.test(async () => {
            const readStub = this.sandbox.stub().resolves({ resource: undefined });
            const createStub = this.sandbox.stub().resolves({});

            this.sandbox.stub(CosmosClient.prototype, 'database').returns({
                container: (name: string) => {
                    if (name === 'data') {
                        return { item: () => ({ read: readStub }) } as any;
                    }
                    return { items: { create: createStub } } as any;
                }
            } as any);

            await AzureArchiveService.archiveBeforeSave('new-dataset', 'opendes');

            assert.isTrue(readStub.calledOnce, 'Should attempt to read current state');
            assert.isFalse(createStub.called, 'Should NOT create archive entry for new item');
        });
    }

    private static archiveBeforeSave_failurePropagates() {
        Tx.sectionInit('archiveBeforeSave - failure propagates to caller');

        Tx.test(async () => {
            const existingData = { id: 'dataset-1', data: { name: 'test' } };
            const readStub = this.sandbox.stub().resolves({ resource: existingData });
            const createStub = this.sandbox.stub().rejects(new Error('Cosmos write failure'));

            this.sandbox.stub(CosmosClient.prototype, 'database').returns({
                container: (name: string) => {
                    if (name === 'data') {
                        return { item: () => ({ read: readStub }) } as any;
                    }
                    return { items: { create: createStub } } as any;
                }
            } as any);

            try {
                await AzureArchiveService.archiveBeforeSave('dataset-1', 'opendes');
                assert.fail('Should have thrown');
            } catch (error) {
                assert.equal(error.message, 'Cosmos write failure');
            }
        });
    }

    private static archiveBatch_allSucceed() {
        Tx.sectionInit('archiveBatch - all succeed');

        Tx.test(async () => {
            const readStub = this.sandbox.stub();
            readStub.onCall(0).resolves({ resource: { id: 'ds-1', data: { name: 'one' } } });
            readStub.onCall(1).resolves({ resource: { id: 'ds-2', data: { name: 'two' } } });
            readStub.onCall(2).resolves({ resource: { id: 'ds-3', data: { name: 'three' } } });
            const createStub = this.sandbox.stub().resolves({});

            this.sandbox.stub(CosmosClient.prototype, 'database').returns({
                container: (name: string) => {
                    if (name === 'data') {
                        return { item: () => ({ read: readStub }) } as any;
                    }
                    return { items: { create: createStub } } as any;
                }
            } as any);

            await AzureArchiveService.archiveBatch(['ds-1', 'ds-2', 'ds-3'], 'opendes');

            assert.equal(createStub.callCount, 3, 'Should archive all 3 items');
        });
    }

    private static archiveBatch_partialFailure() {
        Tx.sectionInit('archiveBatch - partial failure throws');

        Tx.test(async () => {
            const readStub = this.sandbox.stub();
            readStub.onCall(0).resolves({ resource: { id: 'ds-1', data: { name: 'one' } } });
            readStub.onCall(1).resolves({ resource: { id: 'ds-2', data: { name: 'two' } } });

            const createStub = this.sandbox.stub();
            createStub.onCall(0).resolves({});
            createStub.onCall(1).rejects(new Error('Archive write failed'));

            this.sandbox.stub(CosmosClient.prototype, 'database').returns({
                container: (name: string) => {
                    if (name === 'data') {
                        return { item: () => ({ read: readStub }) } as any;
                    }
                    return { items: { create: createStub } } as any;
                }
            } as any);

            try {
                await AzureArchiveService.archiveBatch(['ds-1', 'ds-2'], 'opendes');
                assert.fail('Should have thrown');
            } catch (error) {
                assert.equal(error.message, 'Archive write failed');
            }
        });
    }
}

