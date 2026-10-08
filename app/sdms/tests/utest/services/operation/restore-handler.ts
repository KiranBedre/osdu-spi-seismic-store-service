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

import sinon from 'sinon';
import { Request as expRequest, Response as expResponse } from 'express';
import { LoggerFactory } from '../../../../src/cloud';
import { ILogger } from '../../../../src/cloud/logger';

const testLogger: ILogger = {
    info: () => { return; },
    error: () => { return; },
    metric: () => { return; },
    buildTraceInfo: () => '[MOCK_TRACE]'
};

import { Auth } from '../../../../src/auth';
import { FeatureFlags, Feature, Utils } from '../../../../src/shared';
import { Handler } from '../../../../src/services/operation/handler';
import { Operation } from '../../../../src/services/operation/optype';
import { restoreStatusStorage } from '../../../../src/services/operation/restore-status';
import { RestoreOperationLock } from '../../../../src/services/operation/restore-lock';
import { TaskQueueFactory } from '../../../../src/cloud/taskQueue';
import { AzureTaskQueue } from '../../../../src/cloud/providers/azure';
import { TenantDAO } from '../../../../src/services/tenant';
import { SubProjectDAO, SubprojectAuth } from '../../../../src/services/subproject';
import { DatasetDAO } from '../../../../src/services/dataset';
import { lockerInstance } from '../../../../src/services/dataset/locker';
import { AzureArchiveService } from '../../../../src/cloud/providers/azure/archive-service';
import { Config } from '../../../../src/cloud';
import { JournalFactoryTenantClient } from '../../../../src/cloud';
import { Tx } from '../../utils';

// Relative dates keep these tests independent of the calendar: the restore point is
// recent (within SDMS_RESTORE_MAX_DAYS) and safely after the dataset creation time.
const RESTORE_POINT_IN_TIME = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();

export class TestRestoreHandler {

    private static sandbox = sinon.createSandbox();

    public static run() {

        describe(Tx.testInit('restore-handler'), () => {

            beforeEach(() => {
                this.sandbox.stub(LoggerFactory, 'build').returns(testLogger);
            });

            afterEach(() => {
                this.sandbox.restore();
            });

            this.postRestore();
            this.postRestoreValidation();
            this.postRestoreRemainingChecks();
            this.getRestoreStatus();
        });
    }

    // Stubs the full restore happy path; pass overrides to drive a specific check to failure.
    private static stubRestorePush(overrides: any = {}) {
        const o = {
            featureEnabled: true,
            datasetResult: [{ name: 'dataset1', created_date: '2026-06-01T00:00:00.000Z' }, {}],
            archiveExists: false,
            redisHolder: null,
            cosmosActiveOp: null,
            acquire: true,
            userId: 'user@example.com',
            ...overrides,
        };
        this.sandbox.stub(FeatureFlags, 'isEnabled').returns(o.featureEnabled);
        this.sandbox.stub(TenantDAO, 'get').resolves({ name: 'tenant', esd: 'tenant.esd', gcpid: '', default_acls: '' } as any);
        this.sandbox.stub(Auth, 'isUserRegistered').resolves();
        this.sandbox.stub(JournalFactoryTenantClient, 'get').returns({} as any);
        this.sandbox.stub(SubProjectDAO, 'get').resolves({ name: 'subproject', acls: { admins: ['admin@group'], viewers: ['viewer@group'] } } as any);
        this.sandbox.stub(SubprojectAuth, 'getAuthGroups').returns(['admin@group']);
        this.sandbox.stub(Auth, 'isWriteAuthorized').resolves(true);
        this.sandbox.stub(DatasetDAO, 'get').resolves(o.datasetResult as any);
        this.sandbox.stub(AzureArchiveService, 'hasArchivedEntries').resolves(o.archiveExists);
        this.sandbox.stub(RestoreOperationLock, 'getHolder').resolves(o.redisHolder);
        this.sandbox.stub(restoreStatusStorage, 'getActiveRestoreOperationId').resolves(o.cosmosActiveOp);
        this.sandbox.stub(RestoreOperationLock, 'acquire').resolves(o.acquire);
        this.sandbox.stub(RestoreOperationLock, 'release').resolves(true);
        this.sandbox.stub(Utils, 'getUserId').resolves(o.userId);
        this.sandbox.stub(restoreStatusStorage, 'createRestoreOperation').resolves();
        const taskQueueStub = this.sandbox.createStubInstance<any>(AzureTaskQueue);
        taskQueueStub.pushTask.resolves();
        this.sandbox.stub(TaskQueueFactory, 'build').returns(taskQueueStub);
    }

    private static postRestoreRemainingChecks() {
        Tx.sectionInit('POST /operation/restore - remaining checks');

        // Unparseable restorePointInTime → 400
        Tx.testExpAsync(async (req: expRequest, res: expResponse) => {
            req.body = { sdPath: 'sd://tenant/subproject/path/dataset1', restorePointInTime: 'not-a-date' };
            this.sandbox.stub(FeatureFlags, 'isEnabled').returns(true);
            await Handler.handle(req, res, Operation.RestorePush);
            Tx.check400((res as any).statusCode);
        });

        // Backup retention not configured (maxDays <= 0) → 503
        Tx.testExpAsync(async (req: expRequest, res: expResponse) => {
            const orig = Config.SDMS_RESTORE_MAX_DAYS;
            Config.SDMS_RESTORE_MAX_DAYS = 0;
            try {
                req.body = { sdPath: 'sd://tenant/subproject/path/dataset1', restorePointInTime: RESTORE_POINT_IN_TIME };
                this.sandbox.stub(FeatureFlags, 'isEnabled').returns(true);
                await Handler.handle(req, res, Operation.RestorePush);
                Tx.check503((res as any).statusCode);
            } finally {
                Config.SDMS_RESTORE_MAX_DAYS = orig;
            }
        });

        // restorePointInTime beyond the retention window → 400
        Tx.testExpAsync(async (req: expRequest, res: expResponse) => {
            req.body = {
                sdPath: 'sd://tenant/subproject/path/dataset1',
                restorePointInTime: new Date(Date.now() - (Config.SDMS_RESTORE_MAX_DAYS + 10) * 24 * 60 * 60 * 1000).toISOString()
            };
            this.sandbox.stub(FeatureFlags, 'isEnabled').returns(true);
            await Handler.handle(req, res, Operation.RestorePush);
            Tx.check400((res as any).statusCode);
        });

        // Dataset not found and no archived state → 404
        Tx.testExpAsync(async (req: expRequest, res: expResponse) => {
            req.body = { sdPath: 'sd://tenant/subproject/path/dataset1', restorePointInTime: RESTORE_POINT_IN_TIME };
            this.stubRestorePush({ datasetResult: [], archiveExists: false });
            await Handler.handle(req, res, Operation.RestorePush);
            Tx.check404((res as any).statusCode);
        });

        // restorePointInTime at/before dataset creation → 400
        Tx.testExpAsync(async (req: expRequest, res: expResponse) => {
            req.body = { sdPath: 'sd://tenant/subproject/path/dataset1', restorePointInTime: RESTORE_POINT_IN_TIME };
            // created_date is now (after the restore point 5 days ago)
            this.stubRestorePush({ datasetResult: [{ name: 'dataset1', created_date: new Date().toISOString() }, {}] });
            await Handler.handle(req, res, Operation.RestorePush);
            Tx.check400((res as any).statusCode);
        });

        // No Redis lock but Cosmos shows an active operation → 409
        Tx.testExpAsync(async (req: expRequest, res: expResponse) => {
            req.body = { sdPath: 'sd://tenant/subproject/path/dataset1', restorePointInTime: RESTORE_POINT_IN_TIME };
            this.stubRestorePush({ redisHolder: null, cosmosActiveOp: 'existing-op-id' });
            await Handler.handle(req, res, Operation.RestorePush);
            Tx.check409((res as any).statusCode);
        });

        // Lost the Redis lock acquisition race → 409
        Tx.testExpAsync(async (req: expRequest, res: expResponse) => {
            req.body = { sdPath: 'sd://tenant/subproject/path/dataset1', restorePointInTime: RESTORE_POINT_IN_TIME };
            this.stubRestorePush({ acquire: false });
            await Handler.handle(req, res, Operation.RestorePush);
            Tx.check409((res as any).statusCode);
        });

        // Caller user id cannot be resolved → 400
        Tx.testExpAsync(async (req: expRequest, res: expResponse) => {
            req.body = { sdPath: 'sd://tenant/subproject/path/dataset1', restorePointInTime: RESTORE_POINT_IN_TIME };
            this.stubRestorePush({ userId: null });
            await Handler.handle(req, res, Operation.RestorePush);
            Tx.check400((res as any).statusCode);
        });
    }

    private static postRestore() {
        Tx.sectionInit('POST /operation/restore - success');

        Tx.testExpAsync(async (req: expRequest, res: expResponse) => {
            req.body = {
                sdPath: 'sd://tenant/subproject/path/dataset1',
                restorePointInTime: RESTORE_POINT_IN_TIME,
            };
            req.headers['data-partition-id'] = 'tenant';

            this.sandbox.stub(FeatureFlags, 'isEnabled').returns(true);
            this.sandbox.stub(TenantDAO, 'get').resolves({ name: 'tenant', esd: 'tenant.esd', gcpid: '', default_acls: '' });
            this.sandbox.stub(Auth, 'isUserRegistered').resolves();
            this.sandbox.stub(JournalFactoryTenantClient, 'get').returns({} as any);
            this.sandbox.stub(SubProjectDAO, 'get').resolves({ name: 'subproject', acls: { admins: ['admin@group'], viewers: ['viewer@group'] } } as any);
            this.sandbox.stub(SubprojectAuth, 'getAuthGroups').returns(['admin@group']);
            this.sandbox.stub(Auth, 'isWriteAuthorized').resolves(true);
            this.sandbox.stub(DatasetDAO, 'get').resolves([{ name: 'dataset1', created_date: '2026-06-01T00:00:00.000Z' }, {}] as any);
            this.sandbox.stub(lockerInstance, 'getLock').resolves(null);
            this.sandbox.stub(RestoreOperationLock, 'getHolder').resolves(null);
            this.sandbox.stub(restoreStatusStorage, 'getActiveRestoreOperationId').resolves(null);
            this.sandbox.stub(RestoreOperationLock, 'acquire').resolves(true);
            this.sandbox.stub(Utils, 'getUserId').resolves('user@example.com');
            this.sandbox.stub(restoreStatusStorage, 'createRestoreOperation').resolves();

            const taskQueueStub = this.sandbox.createStubInstance<any>(AzureTaskQueue);
            taskQueueStub.pushTask.resolves();
            this.sandbox.stub(TaskQueueFactory, 'build').returns(taskQueueStub);

            await Handler.handle(req, res, Operation.RestorePush);
            Tx.check202((res as any).statusCode);
        });
    }

    private static postRestoreValidation() {
        Tx.sectionInit('POST /operation/restore - validation');

        // Feature flag disabled
        Tx.testExpAsync(async (req: expRequest, res: expResponse) => {
            req.body = {
                sdPath: 'sd://tenant/subproject/path/dataset1',
                restorePointInTime: RESTORE_POINT_IN_TIME,
            };
            this.sandbox.stub(FeatureFlags, 'isEnabled').returns(false);

            await Handler.handle(req, res, Operation.RestorePush);
            Tx.check501((res as any).statusCode);
        });

        // Missing sdPath
        Tx.testExpAsync(async (req: expRequest, res: expResponse) => {
            req.body = {
                restorePointInTime: RESTORE_POINT_IN_TIME,
            };
            this.sandbox.stub(FeatureFlags, 'isEnabled').returns(true);

            await Handler.handle(req, res, Operation.RestorePush);
            Tx.check400((res as any).statusCode);
        });

        // Missing restorePointInTime
        Tx.testExpAsync(async (req: expRequest, res: expResponse) => {
            req.body = {
                sdPath: 'sd://tenant/subproject/path/dataset1',
            };
            this.sandbox.stub(FeatureFlags, 'isEnabled').returns(true);

            await Handler.handle(req, res, Operation.RestorePush);
            Tx.check400((res as any).statusCode);
        });

        // Invalid timestamp (future)
        Tx.testExpAsync(async (req: expRequest, res: expResponse) => {
            req.body = {
                sdPath: 'sd://tenant/subproject/path/dataset1',
                restorePointInTime: '2099-06-10T08:30:00.000Z',
            };
            this.sandbox.stub(FeatureFlags, 'isEnabled').returns(true);

            await Handler.handle(req, res, Operation.RestorePush);
            Tx.check400((res as any).statusCode);
        });

        // Duplicate in-progress restore for data partition (lock held)
        Tx.testExpAsync(async (req: expRequest, res: expResponse) => {
            req.body = {
                sdPath: 'sd://tenant/subproject/path/dataset1',
                restorePointInTime: RESTORE_POINT_IN_TIME,
            };

            this.sandbox.stub(FeatureFlags, 'isEnabled').returns(true);
            this.sandbox.stub(TenantDAO, 'get').resolves({ name: 'tenant', esd: 'tenant.esd', gcpid: '', default_acls: '' });
            this.sandbox.stub(Auth, 'isUserRegistered').resolves();
            this.sandbox.stub(JournalFactoryTenantClient, 'get').returns({} as any);
            this.sandbox.stub(SubProjectDAO, 'get').resolves({ name: 'subproject', acls: { admins: ['admin@group'], viewers: ['viewer@group'] } } as any);
            this.sandbox.stub(SubprojectAuth, 'getAuthGroups').returns(['admin@group']);
            this.sandbox.stub(Auth, 'isWriteAuthorized').resolves(true);
            this.sandbox.stub(DatasetDAO, 'get').resolves([{ name: 'dataset1', created_date: '2026-06-01T00:00:00.000Z' }, {}] as any);
            this.sandbox.stub(lockerInstance, 'getLock').resolves(null);
            this.sandbox.stub(RestoreOperationLock, 'getHolder').resolves('existing-op-id');

            await Handler.handle(req, res, Operation.RestorePush);
            Tx.check409((res as any).statusCode);
        });

        // Invalid sdPath format
        Tx.testExpAsync(async (req: expRequest, res: expResponse) => {
            req.body = {
                sdPath: 'invalid-path',
                restorePointInTime: RESTORE_POINT_IN_TIME,
            };
            this.sandbox.stub(FeatureFlags, 'isEnabled').returns(true);

            await Handler.handle(req, res, Operation.RestorePush);
            Tx.check400((res as any).statusCode);
        });

        // Write authorization denied
        Tx.testExpAsync(async (req: expRequest, res: expResponse) => {
            req.body = {
                sdPath: 'sd://tenant/subproject/path/dataset1',
                restorePointInTime: RESTORE_POINT_IN_TIME,
            };

            this.sandbox.stub(FeatureFlags, 'isEnabled').returns(true);
            this.sandbox.stub(TenantDAO, 'get').resolves({ name: 'tenant', esd: 'tenant.esd', gcpid: '', default_acls: '' });
            this.sandbox.stub(Auth, 'isUserRegistered').resolves();
            this.sandbox.stub(JournalFactoryTenantClient, 'get').returns({} as any);
            this.sandbox.stub(SubProjectDAO, 'get').resolves({ name: 'subproject', acls: { admins: ['admin@group'], viewers: ['viewer@group'] } } as any);
            this.sandbox.stub(SubprojectAuth, 'getAuthGroups').returns(['admin@group']);
            this.sandbox.stub(Auth, 'isWriteAuthorized').rejects({ error: { code: 403, message: 'Unauthorized', status: 'PERMISSION_DENIED' } });

            await Handler.handle(req, res, Operation.RestorePush);
            Tx.check403((res as any).statusCode);
        });

        // Enqueue failure releases lock and marks operation as Failed
        Tx.testExpAsync(async (req: expRequest, res: expResponse) => {
            req.body = {
                sdPath: 'sd://tenant/subproject/path/dataset1',
                restorePointInTime: RESTORE_POINT_IN_TIME,
            };

            this.sandbox.stub(FeatureFlags, 'isEnabled').returns(true);
            this.sandbox.stub(TenantDAO, 'get').resolves({ name: 'tenant', esd: 'tenant.esd', gcpid: '', default_acls: '' });
            this.sandbox.stub(Auth, 'isUserRegistered').resolves();
            this.sandbox.stub(JournalFactoryTenantClient, 'get').returns({} as any);
            this.sandbox.stub(SubProjectDAO, 'get').resolves({ name: 'subproject', acls: { admins: ['admin@group'], viewers: ['viewer@group'] } } as any);
            this.sandbox.stub(SubprojectAuth, 'getAuthGroups').returns(['admin@group']);
            this.sandbox.stub(Auth, 'isWriteAuthorized').resolves(true);
            this.sandbox.stub(DatasetDAO, 'get').resolves([{ name: 'dataset1', created_date: '2026-06-01T00:00:00.000Z' }, {}] as any);
            this.sandbox.stub(lockerInstance, 'getLock').resolves(null);
            this.sandbox.stub(RestoreOperationLock, 'getHolder').resolves(null);
            this.sandbox.stub(restoreStatusStorage, 'getActiveRestoreOperationId').resolves(null);
            this.sandbox.stub(RestoreOperationLock, 'acquire').resolves(true);
            this.sandbox.stub(RestoreOperationLock, 'release').resolves(true);
            this.sandbox.stub(Utils, 'getUserId').resolves('user@example.com');
            const createStatusStub = this.sandbox.stub(
                restoreStatusStorage, 'createRestoreOperation').resolves();
            this.sandbox.stub(restoreStatusStorage, 'markRestoreOperationFailed').resolves();

            const taskQueueStub = this.sandbox.createStubInstance<any>(AzureTaskQueue);
            taskQueueStub.pushTask.rejects(new Error('Queue unavailable'));
            this.sandbox.stub(TaskQueueFactory, 'build').returns(taskQueueStub);

            await Handler.handle(req, res, Operation.RestorePush);
            Tx.check500((res as any).statusCode);
            sinon.assert.callOrder(createStatusStub, taskQueueStub.pushTask);
        });
    }

    private static getRestoreStatus() {
        Tx.sectionInit('GET /operation/restore/status - success');

        Tx.testExpAsync(async (req: expRequest, res: expResponse) => {
            req.params = { operationId: 'op-123' };
            req.headers['data-partition-id'] = 'tenant';

            this.sandbox.stub(FeatureFlags, 'isEnabled').returns(true);
            this.sandbox.stub(TenantDAO, 'get').resolves({ name: 'tenant', esd: 'tenant.esd', gcpid: '', default_acls: '' });
            this.sandbox.stub(Auth, 'isUserRegistered').resolves();
            this.sandbox.stub(restoreStatusStorage, 'getRestoreOperationStatus').resolves({
                operationId: 'op-123',
                status: 'Succeeded',
                sdPath: 'sd://tenant/subproject/path/dataset1',
                restorePointInTime: '2026-06-10T08:30:00.000Z',
                tenant: 'tenant',
                subproject: 'subproject',
                createdBy: 'user@example.com',
                startedAt: '2026-06-15T10:00:00.000Z',
                completedAt: '2026-06-15T10:02:00.000Z',
            });

            await Handler.handle(req, res, Operation.RestoreStatus);
            Tx.check200((res as any).statusCode);
        });

        // Missing operationId
        Tx.testExpAsync(async (req: expRequest, res: expResponse) => {
            req.params = {};
            req.headers['data-partition-id'] = 'tenant';

            this.sandbox.stub(FeatureFlags, 'isEnabled').returns(true);

            await Handler.handle(req, res, Operation.RestoreStatus);
            Tx.check400((res as any).statusCode);
        });

        // Missing data-partition-id
        Tx.testExpAsync(async (req: expRequest, res: expResponse) => {
            req.params = { operationId: 'op-123' };
            req.headers['data-partition-id'] = '';

            this.sandbox.stub(FeatureFlags, 'isEnabled').returns(true);

            await Handler.handle(req, res, Operation.RestoreStatus);
            Tx.check400((res as any).statusCode);
        });

        // Feature flag disabled
        Tx.testExpAsync(async (req: expRequest, res: expResponse) => {
            req.params = { operationId: 'op-123' };
            req.headers['data-partition-id'] = 'tenant';

            this.sandbox.stub(FeatureFlags, 'isEnabled').returns(false);

            await Handler.handle(req, res, Operation.RestoreStatus);
            Tx.check501((res as any).statusCode);
        });
    }
}
