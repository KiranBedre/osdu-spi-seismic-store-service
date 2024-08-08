// ============================================================================
// Copyright 2017-2024, Schlumberger
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
import { IBulkChangeTierOperationQueueTask } from './model';
import { Config, JournalFactoryTenantClient, StorageFactory } from '../../cloud';
import { Parser } from './parser';
import { Auth, AuthRoles } from '../../auth';
import { DatasetDAO, DatasetModel, ListDatasetsParams } from '../dataset';
import { SubProjectDAO, SubprojectAuth } from '../subproject';
import { TenantDAO } from '../tenant';
import { OperationType } from '../../shared/register';
import { IOperation, IOperationStatus } from '../../shared/model';
import { operationStatusStorage } from './status';
import { TaskQueueFactory } from '../../cloud/taskQueue';
import { SqlParameter } from '@azure/cosmos';
import { ISDPathModel } from '../../shared/sdpath';
import { ITenantModel } from '../tenant/model';

export class Handler {

    // handler for the [ /operation ] endpoints
    public static async handle(req: expRequest, res: expResponse, op: Operation) {

        try {

            switch(op) {
                case Operation.BulkDeletePush:
                    Response.writeOK(res, await this.bulkDelete(req), 202);
                    break;
                case Operation.BulkDeleteStatus:
                    Response.writeOK(res, await this.bulkDeleteStatus(req));
                    break;
                case Operation.BulkChangeTierPush:
                    Response.writeOK(res, await this.bulkChangeTier(req), 202);
                    break;
                case Operation.BulkChangeTierStatus:
                    Response.writeOK(res, await this.bulkChangeTierStatus(req));
                    break;
                default:
				    throw (Error.make(Error.Status.UNKNOWN, 'Internal Server Error'));
            }

        } catch (error) { Response.writeError(res, error); }

    }

    // trigger bulk delete operation for datasets with a given path within the subproject
    private static async bulkDelete(req: expRequest): Promise<IOperation> {

        this.checkFeature(Feature.BULK_DELETE);

        const userInput = Parser.bulkDelete(req);
        const sdPath = userInput.sdPath;
        const tenant = await TenantDAO.get(sdPath.tenant);
        const dataset = this.createDataset(sdPath);
        const [sqlQuery, sqlParams, user] = await this.processRequest(req, sdPath, tenant, dataset, userInput);

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

        this.checkFeature(Feature.BULK_DELETE);

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

    // trigger bulk change tier operation for datasets with a given path within the subproject
    private static async bulkChangeTier(req: expRequest): Promise<IOperation> {

        this.checkFeature(Feature.CHANGE_TIER);

        const userInput = Parser.bulkChangeTier(req);
        const sdPath = userInput.sdPath;
        const changeTier = userInput.tier;
        const tenant = await TenantDAO.get(sdPath.tenant);
        const dataset = this.createDataset(sdPath);
        const [sqlQuery, sqlParams, user] = await this.processRequest(req, sdPath, tenant, dataset, userInput);
        const storage = StorageFactory.build(Config.CLOUDPROVIDER, tenant);

        // check if incoming tier is supported by the cloud provider
        await storage.checkSupportedTier(changeTier.toLowerCase());

        // push the bulk change tier operation
        const operation = {
            type: OperationType.BULK_CHANGE_TIER,
            operation_id: uuidv4(),
            createdBy: user,
            tenant: sdPath.tenant,
            subproject: sdPath.subproject,
            query: sqlQuery,
            tier: (changeTier.charAt(0).toUpperCase() + changeTier.slice(1).toLowerCase()),
            parameters: JSON.stringify(sqlParams),
        } as IBulkChangeTierOperationQueueTask;

        // init journalClient client
        const taskQueue = TaskQueueFactory.build(Config.CLOUDPROVIDER);
        await taskQueue.pushTask(operation);

        return {operation_id: operation.operation_id}
    }

    // get status of a bulk tier change operation
    private static async bulkChangeTierStatus(req: expRequest): Promise<IOperationStatus> {

        this.checkFeature(Feature.CHANGE_TIER);

        const args = Parser.bulkChangeTierStatus(req);

        // Check if user has read access
        await Auth.isUserRegistered(req.headers.authorization,
            args.dataPartitionId + '.esd',
            req[Config.DE_FORWARD_APPKEY]);

        const operationStatus = await operationStatusStorage.getOperationStatus({
            operation_id: args.operationId,
            type: OperationType.BULK_CHANGE_TIER
        });

        if (!operationStatus) {
            throw (Error.make(Error.Status.NOT_FOUND, 'Operation not found'));
        }

        return operationStatus;
    }

    private static checkFeature(feature: Feature) {
        if (!FeatureFlags.isEnabled(feature)) {
            throw (Error.make(Error.Status.NOT_IMPLEMENTED, 'Method not implemented.'));
        }
    }

    private static async processRequest(req: expRequest, sdPath: ISDPathModel, tenant: ITenantModel,
        dataset: DatasetModel, userInput: any): Promise<[string, SqlParameter[], string]> {
        const journalClient = JournalFactoryTenantClient.get(tenant);
        const subproject = await SubProjectDAO.get(journalClient, sdPath.tenant, sdPath.subproject);

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

        // check if dataset exists
        if (dataset.name) {
            const datasetOUT = subproject.enforce_key ?
                await DatasetDAO.getByKey(journalClient, dataset) :
                (await DatasetDAO.get(journalClient, dataset))[0];

            if (!datasetOUT) {
                throw (Error.make(Error.Status.NOT_FOUND,
                    'The dataset ' + Config.SDPATHPREFIX + dataset.tenant + '/' +
                    dataset.subproject + dataset.path + dataset.name + ' does not exist'));
            }
        }

        // get user id
        const user = await Utils.getUserId(
            req.headers.authorization, req.get(Config.USER_ID_HEADER_KEY_NAME));
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
        return [sqlQuery, sqlParams, user];
    }

    private static createDataset(sdPath: ISDPathModel): DatasetModel{
        const dataset = {} as DatasetModel;
        if (sdPath.dataset) { dataset.name = sdPath.dataset; }
        dataset.tenant = sdPath.tenant;
        dataset.subproject = sdPath.subproject;
        dataset.path = sdPath.path || '/';
        return dataset;
    }

}
