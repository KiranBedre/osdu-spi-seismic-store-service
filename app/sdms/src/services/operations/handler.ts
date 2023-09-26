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

import { v4 as uuidv4 } from 'uuid';
import { Request as expRequest, Response as expResponse } from 'express';
import { Operation } from './optype';
import { Error, Response } from '../../shared';
import { IBulkDeleteOperationQueueTask, IOperation, IOperationQueueTask, IOperationStatus } from './model';
import { Config, JournalFactoryTenantClient } from '../../cloud';
import { Parser } from './parser';
import { Auth, AuthRoles } from '../../auth';
import { SubProjectDAO, SubprojectAuth } from '../subproject';
import { TenantDAO } from '../tenant';
import { OperationType } from './register';
import { queueOperations } from './queue';

export class Handler {

    // handler for the [ /operations ] endpoints
    public static async handle(req: expRequest, res: expResponse, op: Operation) {

        try {

            if (op === Operation.BulkDeletePush) {
                const operation = await this.bulkDelete(req);
                Response.writeOK(res, operation, 202);
                return;
            }

            if (op === Operation.BulkDeleteStatus) {
                const status = await this.bulkDeleteStatus(req);
                Response.writeOK(res, status);
                return;
            }

        } catch (error) { Response.writeError(res, error); }

    }

    // trigger bulk delete operation for datasets with a given path within the subproject
    private static async bulkDelete(req: expRequest): Promise<IOperation> {

        if (Config.CLOUDPROVIDER !== 'azure') {
            throw (Error.make(Error.Status.NOT_IMPLEMENTED, 'Method not implemented.'));
        }

        const sdPath = Parser.bulkDelete(req);

        const tenant = await TenantDAO.get(sdPath.tenant);
        const subproject = await SubProjectDAO.get(
            JournalFactoryTenantClient.get(tenant), sdPath.tenant, sdPath.subproject);

        // check if the caller is write authorized (subproject admin)
        await Auth.isWriteAuthorized(req.headers.authorization,
            SubprojectAuth.getAuthGroups(subproject, AuthRoles.admin),
            tenant, subproject.name, req[Config.DE_FORWARD_APPKEY],
            req.headers['impersonation-token-context'] as string);

        const operation = {
            type: OperationType.BULK_DELETE,
            operation_id: uuidv4(),
            tenant: sdPath.tenant,
            subproject: sdPath.subproject,
            path: sdPath.path,
        } as IBulkDeleteOperationQueueTask;

        return await queueOperations.pushOperation(operation);

    }

    // get status of a bulk delete operation
    private static async bulkDeleteStatus(req: expRequest): Promise<IOperationStatus> {

        const operationId = Parser.bulkDeleteStatus(req);

        const operation = {
            operation_id: operationId,
            type: OperationType.BULK_DELETE
        } as IOperationQueueTask

        const operationStatus = await queueOperations.getOperationStatus(operation);
        if (!operationStatus) {
            throw (Error.make(Error.Status.NOT_FOUND, 'Operation not found'));
        }
        return operationStatus;
    }

}
