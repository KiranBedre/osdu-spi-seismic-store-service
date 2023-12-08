// ============================================================================
// Copyright 2017-2023, Schlumberger
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

import sinon, { SinonStub, SinonStubbedInstance } from 'sinon';
import { v4 as uuidv4 } from 'uuid';
import { Tx } from '../utils';
import { Request, Response } from 'express';
import { azure, Config, JournalFactoryTenantClient, IJournal } from '../../../src/cloud';
import { Auth } from '../../../src/auth';
import { Utils } from '../../../src/shared';
import { OperationStatusStorage } from '../../../src/services/operation/status'
import { Handler } from '../../../src/services/operation/handler'
import { Operation } from '../../../src/services/operation/optype'
import { TenantDAO } from '../../../src/services/tenant';
import { SubProjectDAO, SubprojectAuth } from '../../../src/services/subproject';
import { AzureTaskQueue } from '../../../src/cloud/providers/azure';
import { ITaskQueue, TaskQueueFactory } from '../../../src/cloud/taskQueue';
import { IOperationStatus } from '../../../src/shared/model';
import { AndQueryFilter } from '../../../src/services/dataset';

export class TestOperationHandler {

    private static sandbox = sinon.createSandbox();

    public static run() {

        describe(Tx.testInit('operations'), () => {

            beforeEach(() => {
                this.sandbox.define(Config, 'CLOUDPROVIDER', 'azure');
                this.sandbox.replace(Config, 'ENABLE_ADVANCED_QUERY_FILTERS', true);
            });

            afterEach(()=>{
                this.sandbox.restore();
            })

            this.bulkDelete();
            this.bulkDeleteStatus();
        });
    }

    private static bulkDelete() {

        Tx.sectionInit('bulkDelete');

        Tx.testExpAsync(async (req: Request, res: Response) => {
            const journalStub = this.setUpStubsForBulkDeletePush(req);
            
            let taskQueueStub = this.sandbox.createStubInstance<ITaskQueue>(AzureTaskQueue);
            taskQueueStub.pushTask.resolves();
            this.sandbox.stub(TaskQueueFactory, 'build').returns(taskQueueStub);

            await Handler.handle(req, res, Operation.BulkDeletePush);
            Tx.check202(res.statusCode);
            Tx.checkTrue(journalStub.listDatasetsQuery.getCall(0).args[0].filter === undefined);
        });

        Tx.testExpAsync(async (req: Request, res: Response) => {
            req.body = {
            'filter': {
                'and': [
                    {
                        'property': 'name',
                        'operator': 'LIKE',
                        'value': 'test.%'
                    },
                    {
                        'property': 'readonly',
                        'operator': '=',
                        'value': true
                    }
                ]
            }};
            const journalStub = this.setUpStubsForBulkDeletePush(req);

            let taskQueueStub = this.sandbox.createStubInstance<ITaskQueue>(AzureTaskQueue);
            taskQueueStub.pushTask.resolves();
            this.sandbox.stub(TaskQueueFactory, 'build').returns(taskQueueStub);

            await Handler.handle(req, res, Operation.BulkDeletePush);
            Tx.check202(res.statusCode);
            Tx.checkTrue(journalStub.listDatasetsQuery.getCall(0).args[0].filter instanceof AndQueryFilter);
        });

        Tx.testExpAsync(async (req: Request, res: Response) => {
            let taskQueueStub = this.sandbox.createStubInstance<ITaskQueue>(AzureTaskQueue);
            taskQueueStub.pushTask.throws();
            this.sandbox.stub(TaskQueueFactory, 'build').returns(taskQueueStub);

            await Handler.handle(req, res, Operation.BulkDeletePush);
            Tx.check500(res.statusCode);
        });
    }

    private static setUpStubsForBulkDeletePush(req: Request): SinonStubbedInstance<IJournal> {
        req.query.path = 'sd://tenant/subproject/path';
        req.params.userId = 'userId';
        this.sandbox.stub(TenantDAO, 'get').resolves({} as any);
        this.sandbox.stub(Utils, 'getUserId').resolves(req.params.userId);
        this.sandbox.stub(SubProjectDAO, 'get').resolves({name: 'subproject'} as any);
        this.sandbox.stub(SubprojectAuth, 'getAuthGroups').resolves();
        this.sandbox.stub(Auth, 'isWriteAuthorized').resolves();

        const journalStub = this.sandbox.createStubInstance<IJournal>(azure.AzureCosmosDbDAO);
        journalStub.pathExists.returns(Promise.resolve(true));
        this.sandbox.stub(JournalFactoryTenantClient, 'get').returns(journalStub);

        return journalStub;
    }

    private static bulkDeleteStatus() {

        Tx.sectionInit('bulkDeleteStatus');

        Tx.testExpAsync(async (req: Request, expRes: Response) => {
            req.params.operationid = 'operationId';
            req.headers['data-partition-id'] = 'tenant';
            const operationStatus = {
                operation_id: uuidv4(),
                created_at: "string",
                created_by: "string",
                last_updated_at: "string",
                status: "string",
                dataset_cnt: 1000,
                completed_cnt: 10,
                failed_cnt: 1
            } as IOperationStatus
            this.sandbox.stub(OperationStatusStorage.prototype, 'getOperationStatus').resolves(operationStatus);
            this.sandbox.stub(Auth, 'isUserRegistered').resolves();
            await Handler.handle(req, expRes, Operation.BulkDeleteStatus);
            Tx.check200(expRes.statusCode);
        });

        Tx.testExpAsync(async (req: Request, res: Response) => {
            req.query.operationid = 'operationId';
            req.headers['data-partition-id'] = 'tenant';
            this.sandbox.stub(OperationStatusStorage.prototype, 'getOperationStatus').resolves(undefined);
            this.sandbox.stub()
            this.sandbox.stub(Auth, 'isUserRegistered').resolves();
            await Handler.handle(req, res, Operation.BulkDeleteStatus);
            Tx.check404(res.statusCode);
        });
    }
}
