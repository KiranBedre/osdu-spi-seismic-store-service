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

import sinon from 'sinon';
import { v4 as uuidv4 } from 'uuid';
import { Tx } from '../utils';
import { Request, Response } from 'express';
import { Config, JournalFactoryTenantClient } from '../../../src/cloud';
import { Auth } from '../../../src/auth';
import { QueueOperations } from '../../../src/services/operations/queue'
import { Handler } from '../../../src/services/operations/handler'
import { Operation } from '../../../src/services/operations/optype'
import { TenantDAO } from '../../../src/services/tenant';
import { SubProjectDAO, SubprojectAuth } from '../../../src/services/subproject';
import { IOperationStatus } from '../../../src/services/operations/model';

export class TestOperationHandler {

    private static sandbox = sinon.createSandbox();

    public static run() {

        describe(Tx.testInit('dataset'), () => {

            let backup: string;
            beforeEach(() => {
                backup = Config.CLOUDPROVIDER;
                Config.CLOUDPROVIDER = 'azure';
                this.sandbox.restore();
            });

            afterEach(()=>{
                Config.CLOUDPROVIDER = backup;
            })

            this.bulkDelete();
            this.bulkDeleteStatus();
        });
    }

    private static bulkDelete() {

        Tx.sectionInit('bulkDelete');

        Tx.testExpAsync(async (req: Request, res: Response) => {
            req.query.path = 'sd://tenant/subproject/path';
            this.sandbox.stub(TenantDAO, 'get').resolves({} as any);
            this.sandbox.stub(JournalFactoryTenantClient, 'get').resolves();
            this.sandbox.stub(SubProjectDAO, 'get').resolves({ name: 'subproject' } as any);
            this.sandbox.stub(SubprojectAuth, 'getAuthGroups').resolves();
            this.sandbox.stub(Auth, 'isWriteAuthorized').resolves();
            this.sandbox.stub(QueueOperations.prototype, 'pushOperation').resolves();
            await Handler.handle(req, res, Operation.BulkDeletePush);
            Tx.check202(res.statusCode);
        });


        Tx.testExpAsync(async (req: Request, res: Response) => {
            req.query.path = 'sd://tenant/subproject/path';
            this.sandbox.stub(TenantDAO, 'get').resolves({} as any);
            this.sandbox.stub(JournalFactoryTenantClient, 'get').resolves();
            this.sandbox.stub(SubProjectDAO, 'get').resolves({ name: 'subproject' } as any);
            this.sandbox.stub(SubprojectAuth, 'getAuthGroups').resolves();
            this.sandbox.stub(Auth, 'isWriteAuthorized').resolves();
            this.sandbox.stub(QueueOperations.prototype, 'pushOperation').throws();
            await Handler.handle(req, res, Operation.BulkDeletePush);
            Tx.check500(res.statusCode);
        });
    }

    private static bulkDeleteStatus() {

        Tx.sectionInit('bulkDeleteStatus');

        Tx.testExpAsync(async (req: Request, expRes: Response) => {
            req.params.operationid = 'operationId';
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
            this.sandbox.stub(QueueOperations.prototype, 'getOperationStatus').resolves(operationStatus);
            await Handler.handle(req, expRes, Operation.BulkDeleteStatus);
            Tx.check200(expRes.statusCode);
        });

        Tx.testExpAsync(async (req: Request, res: Response) => {
            req.query.operationid = 'operationId';
            this.sandbox.stub(QueueOperations.prototype, 'getOperationStatus').resolves(undefined);
            await Handler.handle(req, res, Operation.BulkDeleteStatus);
            Tx.check404(res.statusCode);
        });
    }
}
