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

import { expect } from 'chai';
import sinon from 'sinon';
import { AzureRestoreOperationStatusStorage } from '../../../../src/cloud/providers/azure/restore-operation-status';
import { Tx } from '../../utils';

export class TestAzureRestoreOperationStatus {

    private static sandbox: sinon.SinonSandbox;
    private static storage: AzureRestoreOperationStatusStorage;
    private static mockContainer: any;
    private static createStub: sinon.SinonStub;
    private static queryStub: sinon.SinonStub;
    private static itemStub: sinon.SinonStub;
    private static readStub: sinon.SinonStub;
    private static patchStub: sinon.SinonStub;
    private static fetchAllStub: sinon.SinonStub;

    public static run() {
        describe(Tx.testInit('azure restore operation status', true), () => {
            beforeEach(() => {
                this.sandbox = sinon.createSandbox();
                this.storage = new AzureRestoreOperationStatusStorage();
                this.createStub = this.sandbox.stub().resolves();
                this.fetchAllStub = this.sandbox.stub().resolves({ resources: [] });
                this.queryStub = this.sandbox.stub().returns({ fetchAll: this.fetchAllStub });
                this.readStub = this.sandbox.stub();
                this.patchStub = this.sandbox.stub().resolves();
                this.itemStub = this.sandbox.stub().returns({
                    read: this.readStub,
                    patch: this.patchStub
                });
                this.mockContainer = {
                    items: {
                        create: this.createStub,
                        query: this.queryStub
                    },
                    item: this.itemStub
                };
                this.sandbox.stub(AzureRestoreOperationStatusStorage.prototype as any, 'getContainer')
                    .resolves(this.mockContainer);
            });

            afterEach(() => {
                this.sandbox.restore();
                (AzureRestoreOperationStatusStorage as any).containerCache.clear();
                (AzureRestoreOperationStatusStorage as any).cosmosClientCache.clear();
            });

            this.testCreateRestoreOperation();
            this.testGetRestoreOperationStatus();
            this.testMarkRestoreOperationFailed();
            this.testGetActiveRestoreOperationId();
        });
    }

    private static testCreateRestoreOperation() {
        Tx.sectionInit('createRestoreOperation');

        Tx.test(async () => {
            await this.storage.createRestoreOperation({
                operationId: 'op-123',
                tenant: 'tenant-a',
                subproject: 'subproject-a',
                sdPath: 'sd://tenant-a/subproject-a/path/dataset',
                restorePointInTime: '2026-06-20T10:00:00.000Z',
                createdBy: 'user@example.com'
            });

            sinon.assert.calledOnce(this.createStub);
            const record = this.createStub.firstCall.args[0];
            expect(record.id).to.equal('op-123');
            expect(record.operationId).to.equal('op-123');
            expect(record.tenant).to.equal('tenant-a');
            expect(record.subproject).to.equal('subproject-a');
            expect(record.sdPath).to.equal('sd://tenant-a/subproject-a/path/dataset');
            expect(record.restorePointInTime).to.equal('2026-06-20T10:00:00.000Z');
            expect(record.createdBy).to.equal('user@example.com');
            expect(record.status).to.equal('Enqueued');
            expect(record.errorDetails).to.be.undefined;
            expect(record.startedAt).to.be.a('string');
            expect(record.lastUpdatedAt).to.be.a('string');
        });
    }

    private static testGetRestoreOperationStatus() {
        Tx.sectionInit('getRestoreOperationStatus');

        Tx.test(async () => {
            this.readStub.resolves({
                resource: {
                    operationId: 'op-123',
                    status: 'Succeeded',
                    sdPath: 'sd://tenant-a/subproject-a/path/dataset',
                    restorePointInTime: '2026-06-20T10:00:00.000Z',
                    tenant: 'tenant-a',
                    subproject: 'subproject-a',
                    createdBy: 'user@example.com',
                    errorDetails: '',
                    startedAt: '2026-06-20T10:05:00.000Z',
                    lastUpdatedAt: '2026-06-20T10:10:00.000Z',
                    completedAt: '2026-06-20T10:15:00.000Z'
                }
            });

            const result = await this.storage.getRestoreOperationStatus('op-123', 'tenant-a');

            expect(result).to.deep.equal({
                operationId: 'op-123',
                status: 'Succeeded',
                sdPath: 'sd://tenant-a/subproject-a/path/dataset',
                restorePointInTime: '2026-06-20T10:00:00.000Z',
                tenant: 'tenant-a',
                subproject: 'subproject-a',
                createdBy: 'user@example.com',
                errorDetails: '',
                startedAt: '2026-06-20T10:05:00.000Z',
                lastUpdatedAt: '2026-06-20T10:10:00.000Z',
                completedAt: '2026-06-20T10:15:00.000Z'
            });
            sinon.assert.calledOnceWithExactly(this.itemStub, 'op-123', 'op-123');
        });

        Tx.test(async () => {
            this.readStub.resolves({ resource: null });

            try {
                await this.storage.getRestoreOperationStatus('op-123', 'tenant-a');
            } catch (error) {
                expect(error.error.code).to.equal(404);
            }
        });

        Tx.test(async () => {
            try {
                await this.storage.getRestoreOperationStatus('op-123', '');
            } catch (error) {
                expect(error.error.code).to.equal(400);
            }
        });
    }

    private static testMarkRestoreOperationFailed() {
        Tx.sectionInit('markRestoreOperationFailed');

        Tx.test(async () => {
            await this.storage.markRestoreOperationFailed('op-123', 'tenant-a', 'restore failed');

            sinon.assert.calledOnceWithExactly(this.itemStub, 'op-123', 'op-123');
            sinon.assert.calledOnce(this.patchStub);
            const ops = this.patchStub.firstCall.args[0];
            expect(ops[0]).to.deep.equal({ op: 'replace', path: '/status', value: 'Failed' });
            expect(ops[1]).to.deep.equal({ op: 'set', path: '/errorDetails', value: 'restore failed' });
            expect(ops[2].op).to.equal('add');
            expect(ops[2].path).to.equal('/completedAt');
            expect(ops[3].op).to.equal('replace');
            expect(ops[3].path).to.equal('/lastUpdatedAt');
        });
    }

    private static testGetActiveRestoreOperationId() {
        Tx.sectionInit('getActiveRestoreOperationId');

        Tx.test(async () => {
            this.fetchAllStub.resolves({ resources: [{ operationId: 'op-123' }] });

            const result = await this.storage.getActiveRestoreOperationId('tenant-a');

            expect(result).to.equal('op-123');
            sinon.assert.calledOnceWithExactly(this.queryStub, {
                query: 'SELECT TOP 1 c.operationId FROM c WHERE c.status IN (@enqueued, @inProgress)',
                parameters: [
                    { name: '@enqueued', value: 'Enqueued' },
                    { name: '@inProgress', value: 'InProgress' }
                ]
            });
        });

        Tx.test(async () => {
            this.fetchAllStub.resolves({ resources: [] });

            const result = await this.storage.getActiveRestoreOperationId('tenant-a');

            expect(result).to.equal(null);
        });
    }
}
