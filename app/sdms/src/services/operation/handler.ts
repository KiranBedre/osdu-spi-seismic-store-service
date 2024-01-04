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
import { Error, Feature, FeatureFlags, Response, Utils } from '../../shared';
import { IBulkDeleteOperationQueueTask } from './model';
import { Config, JournalFactoryTenantClient } from '../../cloud';
import { Parser } from './parser';
import { Auth, AuthRoles } from '../../auth';
import { DatasetModel, ListDatasetsParams } from '../dataset';
import { SubProjectDAO, SubprojectAuth } from '../subproject';
import { TenantDAO } from '../tenant';
import { OperationType } from '../../shared/register';
import { IOperation, IOperationStatus } from '../../shared/model';
import { operationStatusStorage } from './status';
import { TaskQueueFactory } from '../../cloud/taskQueue';

export class Handler {

    // handler for the [ /operation ] endpoints
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

        if (!FeatureFlags.isEnabled(Feature.BULK_DELETE)) {
            throw (Error.make(Error.Status.NOT_IMPLEMENTED, 'Method not implemented.'));
        }

        const userInput = Parser.bulkDelete(req);
        const sdPath = userInput.sdPath;

        const tenant = await TenantDAO.get(sdPath.tenant);

        const dataset = {} as DatasetModel;
        dataset.tenant = sdPath.tenant;
        dataset.subproject = sdPath.subproject;
        dataset.path = sdPath.path || '/';

        const journalClient = JournalFactoryTenantClient.get(tenant);

        const subproject = await SubProjectDAO.get(
            journalClient, sdPath.tenant, sdPath.subproject);

        // if the path is not defined, assume root
        sdPath.path = sdPath.path || '/';

        // check if the caller is write authorized (subproject admin)
        await Auth.isWriteAuthorized(req.headers.authorization,
            SubprojectAuth.getAuthGroups(subproject, AuthRoles.admin),
            tenant, subproject.name, req[Config.DE_FORWARD_APPKEY],
            req.headers['impersonation-token-context'] as string);

        // check if the path exists
        if (!await journalClient.pathExists(subproject.name, dataset.path)) {
            throw (Error.make(Error.Status.NOT_FOUND, 'Path not found'));
        }

        const user = req.get(Config.USER_ID_HEADER_KEY_NAME) || await Utils.getUserId(req.headers.authorization);
        if (!user) {
            throw (Error.make(Error.Status.BAD_REQUEST, 'User not found'));
        }

        const listParams: ListDatasetsParams = {
            dataset,
            selectParam: ['id', 'gcsurl', 'path', 'name'],
            filter: userInput.filter,
            recursive: true
        };
        const [sqlQuery, sqlParams] = journalClient.listDatasetsQuery(listParams);

        // push the bulk delete operation
        const operation = {
            type: OperationType.BULK_DELETE,
            operation_id: uuidv4(),
            createdBy: user,
            tenant: sdPath.tenant,
            subproject: sdPath.subproject,
            query: sqlQuery,
            parameters: JSON.stringify(sqlParams),
        } as IBulkDeleteOperationQueueTask;

        // init journalClient client
        const taskQueue = TaskQueueFactory.build(Config.CLOUDPROVIDER);
        await taskQueue.pushTask(operation);

        return {operation_id: operation.operation_id}
    }

    // get status of a bulk delete operation
    private static async bulkDeleteStatus(req: expRequest): Promise<IOperationStatus> {

        if (!FeatureFlags.isEnabled(Feature.BULK_DELETE)) {
            throw (Error.make(Error.Status.NOT_IMPLEMENTED, 'Method not implemented.'));
        }

        const args = Parser.bulkDeleteStatus(req);

        // Check if user has read access
        await Auth.isUserRegistered(req.headers.authorization,
            args.dataPartitionId + '.esd',
            req[Config.DE_FORWARD_APPKEY]);

        const operationStatus = await operationStatusStorage.getOperationStatus({
            operation_id: args.operationId,
            type: OperationType.BULK_DELETE
        });

        if (!operationStatus) {
            throw (Error.make(Error.Status.NOT_FOUND, 'Operation not found'));
        }

        return operationStatus;
    }

}
