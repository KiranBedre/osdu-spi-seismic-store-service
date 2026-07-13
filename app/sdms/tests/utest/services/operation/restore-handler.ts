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
    debug: () => { return; },
    metric: () => { return; },
    buildTraceInfo: () => '[MOCK_TRACE]'
};
const loggerStub = sinon.stub(LoggerFactory, 'build').returns(testLogger);

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
import { JournalFactoryTenantClient } from '../../../../src/cloud';
import { Tx } from '../../utils';

loggerStub.restore();

// Relative dates keep these tests independent of the calendar: the restore point is
// recent (within SDMS_RESTORE_MAX_DAYS) and safely after the dataset creation time.
const RESTORE_POINT_IN_TIME = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();

export class TestRestoreHandler {

    private static sandbox = sinon.createSandbox();

    public static run() {

        describe(Tx.testInit('restore-handler'), () => {

            afterEach(() => {
                this.sandbox.restore();
            });

            this.postRestore();
            this.postRestoreValidation();
            this.getRestoreStatus();
        });
    }

    private static postRestore() {
        Tx.sectionInit('POST /operation/restore - success');

        Tx.testExpAsync(async (req: expRequest, res: expResponse) => {
            req.body = {
                sdPath: 'sd://tenant/subproject/path/dataset1',
                restorePointInTime: RESTORE_POINT_IN_TIME,
                reason: 'Accidental overwrite'
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
                reason: 'test'
            };
            this.sandbox.stub(FeatureFlags, 'isEnabled').returns(false);

            await Handler.handle(req, res, Operation.RestorePush);
            Tx.check403((res as any).statusCode);
        });

        // Missing sdPath
        Tx.testExpAsync(async (req: expRequest, res: expResponse) => {
            req.body = {
                restorePointInTime: RESTORE_POINT_IN_TIME,
                reason: 'test'
            };
            this.sandbox.stub(FeatureFlags, 'isEnabled').returns(true);

            await Handler.handle(req, res, Operation.RestorePush);
            Tx.check400((res as any).statusCode);
        });

        // Missing restorePointInTime
        Tx.testExpAsync(async (req: expRequest, res: expResponse) => {
            req.body = {
                sdPath: 'sd://tenant/subproject/path/dataset1',
                reason: 'test'
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
                reason: 'test'
            };
            this.sandbox.stub(FeatureFlags, 'isEnabled').returns(true);

            await Handler.handle(req, res, Operation.RestorePush);
            Tx.check400((res as any).statusCode);
        });

        // Invalid reason type (must be string if provided)
        Tx.testExpAsync(async (req: expRequest, res: expResponse) => {
            req.body = {
                sdPath: 'sd://tenant/subproject/path/dataset1',
                restorePointInTime: RESTORE_POINT_IN_TIME,
                reason: 123
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
                reason: 'test'
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
                reason: 'test'
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
                reason: 'test'
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
                reason: 'test'
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
            this.sandbox.stub(restoreStatusStorage, 'createRestoreOperation').resolves();
            this.sandbox.stub(restoreStatusStorage, 'markRestoreOperationFailed').resolves();

            const taskQueueStub = this.sandbox.createStubInstance<any>(AzureTaskQueue);
            taskQueueStub.pushTask.rejects(new Error('Queue unavailable'));
            this.sandbox.stub(TaskQueueFactory, 'build').returns(taskQueueStub);

            await Handler.handle(req, res, Operation.RestorePush);
            Tx.check500((res as any).statusCode);
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
                reason: 'test',
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
            Tx.check403((res as any).statusCode);
        });
    }
}
