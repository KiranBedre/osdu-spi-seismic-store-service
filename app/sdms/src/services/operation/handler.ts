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

import { v4 as uuidv4 } from 'uuid';
import { Request as expRequest, Response as expResponse } from 'express';
import { Operation } from './optype';
import { CallContext, Error, Feature, FeatureFlags, Response, SDPath, Utils } from '../../shared';
import { IBulkDeleteOperationQueueTask } from './model';
import { IBulkChangeTierOperationQueueTask } from './model';
import { IRestoreOperationQueueTask } from './model';
import { Config, JournalFactoryTenantClient, LoggerFactory, StorageFactory } from '../../cloud';
import { Parser } from './parser';
import { Auth, AuthRoles } from '../../auth';
import { DatasetDAO, DatasetModel, ListDatasetsParams } from '../dataset';
import { lockerInstance } from '../dataset/locker';
import { SubProjectDAO, SubprojectAuth } from '../subproject';
import { TenantDAO } from '../tenant';
import { OperationType } from '../../shared/register';
import { IOperation, IOperationStatus } from '../../shared/model';
import { operationStatusStorage } from './status';
import { restoreStatusStorage } from './restore-status';
import { RestoreOperationLock } from './restore-lock';
import { TaskQueueFactory } from '../../cloud/taskQueue';
import { SqlParameter } from '@azure/cosmos';
import { ISDPathModel } from '../../shared/sdpath';
import { AzureArchiveService } from '../../cloud/providers/azure/archive-service';
import { AzureDataEcosystemServices } from '../../cloud/providers/azure/dataecosystem';
import { ITenantModel } from '../tenant/model';

export class Handler {

    private static get logger() { return LoggerFactory.build(Config.CLOUDPROVIDER); }

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
                case Operation.RestorePush:
                    Response.writeOK(res, await this.restorePush(req), 202);
                    break;
                case Operation.RestoreStatus:
                    Response.writeOK(res, await this.restoreStatus(req));
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
        const storage = StorageFactory.build(Config.CLOUDPROVIDER, tenant);

        // check if incoming tier is supported by the cloud provider
        await storage.checkSupportedTier(changeTier);

        const dataset = this.createDataset(sdPath);
        const [sqlQuery, sqlParams, user] = await this.processRequest(req, sdPath, tenant, dataset, userInput);

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

    // trigger a point-in-time restore operation
    private static async restorePush(req: expRequest): Promise<IOperation> {
        const context = 'RestorePush';
        this.checkFeature(Feature.RESTORE);

        const { sdPath, restorePointInTime } = this.parseAndValidateRestoreRequest(req);

        const parsedPath = SDPath.getFromString(sdPath, true);
        if (!parsedPath || !parsedPath.tenant || !parsedPath.subproject) {
            throw Error.make(Error.Status.BAD_REQUEST,
                'Invalid sdPath format. Must be: sd://<tenant>/<subproject>/<path>/<dataset>');
        }

        // Validate tenant and subproject, authorize user
        const tenant = await TenantDAO.get(parsedPath.tenant);
        await Auth.isUserRegistered(
            req.headers.authorization, tenant.esd, req[Config.DE_FORWARD_APPKEY]);

        const journalClient = JournalFactoryTenantClient.get(tenant);
        const subproject = await SubProjectDAO.get(journalClient, parsedPath.tenant, parsedPath.subproject);
        await Auth.isWriteAuthorized(req.headers.authorization,
            SubprojectAuth.getAuthGroups(subproject, AuthRoles.admin, tenant.esd),
            tenant, subproject.name, req[Config.DE_FORWARD_APPKEY],
            req.headers['impersonation-token-context'] as string);

        // Validate dataset existence
        const dataset = this.createDataset(parsedPath);
        if (dataset.name) {
            const datasetOUT = subproject.enforce_key ?
                await DatasetDAO.getByKey(journalClient, dataset) :
                (await DatasetDAO.get(journalClient, dataset))[0];
            if (!datasetOUT) {
                // Not in primary — archive is partitioned by sd:// path, so look it up by that path.
                const datasetSdPath = SDPath.build(
                    dataset.tenant, dataset.subproject, dataset.path, dataset.name);
                const archiveExists = await this.checkArchiveContainerForDataset(
                    datasetSdPath, parsedPath.tenant);
                if (!archiveExists) {
                    throw Error.make(Error.Status.NOT_FOUND,
                        'The dataset ' + datasetSdPath +
                        ' does not exist and has no archived state');
                }
            } else {
                // Check restorePointInTime is after dataset creation
                if (datasetOUT.created_date) {
                    const createdAt = new Date(datasetOUT.created_date).getTime();
                    const restoreAt = new Date(restorePointInTime).getTime();
                    if (restoreAt <= createdAt) {
                        throw Error.make(Error.Status.BAD_REQUEST,
                            'restorePointInTime must be after the dataset creation time (' +
                            datasetOUT.created_date + '). Cannot restore to a point before the dataset existed.');
                    }
                }
            }
        }

        const operationId = uuidv4();
        let storageAccountName: string;
        try {
            storageAccountName = await AzureDataEcosystemServices.getStorageResourceName(parsedPath.tenant);
        } catch (error) {
            this.logger.error({
                message: `Failed to resolve storage account for restore: ${(error as any).message}`,
                context, operationId
            });
            throw Error.make(Error.Status.NOT_AVAILABLE,
                'Restore service temporarily unavailable. Please try again later.');
        }

        // Step 1: Check if the storage-account Redis lock exists (fast check, no acquisition)
        try {
            const currentHolder = await RestoreOperationLock.getHolder(storageAccountName);
            if (currentHolder) {
                this.logger.info({
                    message: `Restore rejected: Redis lock held by operationId ${currentHolder}`,
                    context, rejectionSource: 'redis-lock',
                });
                throw Error.make(Error.Status.ALREADY_EXISTS,
                    `A restore operation is already in progress for this data partition `
                    + `(operationId: ${currentHolder}). Only one restore can run at a time per data partition.`);
            }
        } catch (error) {
            if ((error as any)?.error?.code === 409) throw error;
            this.logger.error({
                message: `Redis unavailable during lock check: ${(error as any).message}`,
                context, operationId
            });
            throw Error.make(Error.Status.NOT_AVAILABLE,
                'Restore service temporarily unavailable. Please try again later.');
        }

        // Step 2: Check Cosmos for active operations on the same storage account.
        const inProgressOperationId = await restoreStatusStorage.getActiveRestoreOperationId(
            parsedPath.tenant, storageAccountName);
        if (inProgressOperationId) {
            this.logger.info({
                message: `Restore rejected: Cosmos shows active operationId ${inProgressOperationId}`,
                context, rejectionSource: 'cosmos-fallback',
            });
            throw Error.make(Error.Status.ALREADY_EXISTS,
                `A restore operation is already in progress for this data partition `
                + `(operationId: ${inProgressOperationId}). Only one restore can run at a time per data partition.`);
        }

        // Step 3: Acquire Redis lock now that both checks passed
        try {
            const lockAcquired = await RestoreOperationLock.acquire(storageAccountName, operationId);
            if (!lockAcquired) {
                this.logger.info({
                    message: `Restore rejected: Redis lock race condition lost`,
                    context, rejectionSource: 'redis-race',
                });
                throw Error.make(Error.Status.ALREADY_EXISTS,
                    'A restore operation is already in progress for this data partition. '
                    + 'Only one restore can run at a time per data partition.');
            }
        } catch (error) {
            if ((error as any)?.error?.code === 409) throw error;
            this.logger.error({
                message: `Redis unavailable during lock acquire: ${(error as any).message}`,
                context, operationId
            });
            throw Error.make(Error.Status.NOT_AVAILABLE,
                'Restore service temporarily unavailable. Please try again later.');
        }

        const user = await Utils.getUserId(
            req.headers.authorization, req.get(Config.USER_ID_HEADER_KEY_NAME));
        if (!user) {
            await RestoreOperationLock.release(storageAccountName, operationId);
            throw Error.make(Error.Status.BAD_REQUEST, 'User not found');
        }

        // Persist the status before publishing the queue message so a fast consumer cannot create
        // a competing fallback record for the same operation.
        let statusCreated = false;
        try {
            const task: IRestoreOperationQueueTask = {
                type: OperationType.RESTORE,
                operation_id: operationId,
                createdBy: user,
                sdPath,
                restorePointInTime,
                storageAccountName,
                correlationId: CallContext.correlationId,
            };

            await restoreStatusStorage.createRestoreOperation({
                operationId,
                tenant: parsedPath.tenant,
                subproject: parsedPath.subproject,
                sdPath,
                restorePointInTime,
                createdBy: user,
                storageAccountName,
            });
            statusCreated = true;

            const taskQueue = TaskQueueFactory.build(Config.CLOUDPROVIDER);
            await taskQueue.pushTask(task);
        } catch (error) {
            this.logger.error({
                message: `Failed to create/enqueue restore operation: ${(error as any).message}`,
                context, operationId
            });
            if (statusCreated) {
                await this.persistRestoreSetupFailure(
                    operationId, parsedPath.tenant,
                    `Operation setup failure: ${(error as any).message}`, context);
            }
            await RestoreOperationLock.release(storageAccountName, operationId);
            throw Error.make(Error.Status.UNKNOWN, 'Failed to initiate restore operation');
        }

        this.logger.info({ message: `Restore operation created and enqueued`, context, operationId, sdPath });

        const basePath = Config.API_BASE_PATH?.replace(/\/+$/, '') || '/seistore-svc/api/v3';
        return {
            operation_id: operationId,
            statusUrl: `${basePath}/operation/restore/${operationId}`
        } as any;
    }

    private static async persistRestoreSetupFailure(
        operationId: string, tenant: string, failure: string, context: any): Promise<void> {
        const attempts = 3;
        let lastError: any;
        for (let attempt = 1; attempt <= attempts; attempt++) {
            try {
                await restoreStatusStorage.markRestoreOperationFailed(operationId, tenant, failure);
                return;
            } catch (statusError) {
                lastError = statusError;
                this.logger.error({
                    message: `Failed to mark restore operation as failed `
                        + `(attempt ${attempt}/${attempts}): ${(statusError as any).message}`,
                    context, operationId
                });
            }
        }
        throw lastError;
    }

    // get status of a restore operation
    private static async restoreStatus(req: expRequest): Promise<any> {
        this.checkFeature(Feature.RESTORE);

        const operationId = req.params.operationid || req.params.operationId;
        if (!operationId) {
            throw Error.make(Error.Status.BAD_REQUEST, 'operationId is required');
        }

        const dataPartitionId = req.headers['data-partition-id'] as string;
        if (!dataPartitionId) {
            throw Error.make(Error.Status.BAD_REQUEST, 'data-partition-id header is required');
        }

        await Auth.isUserRegistered(req.headers.authorization,
            dataPartitionId + '.esd',
            req[Config.DE_FORWARD_APPKEY]);

        return restoreStatusStorage.getRestoreOperationStatus(operationId, dataPartitionId);
    }

    private static parseAndValidateRestoreRequest(req: expRequest): {
        sdPath: string;
        restorePointInTime: string;
    } {
        const { sdPath, restorePointInTime } = req.body || {};

        if (!sdPath || typeof sdPath !== 'string') {
            throw Error.make(Error.Status.BAD_REQUEST, 'sdPath is required and must be a string');
        }
        if (!restorePointInTime || typeof restorePointInTime !== 'string') {
            throw Error.make(Error.Status.BAD_REQUEST, 'restorePointInTime is required and must be an ISO-8601 string');
        }
        const ts = new Date(restorePointInTime);
        if (isNaN(ts.getTime())) {
            throw Error.make(Error.Status.BAD_REQUEST, 'restorePointInTime must be a valid ISO-8601 date');
        }
        if (ts.getTime() > Date.now()) {
            throw Error.make(Error.Status.BAD_REQUEST, 'restorePointInTime must be in the past');
        }
        const maxDays = Config.SDMS_RESTORE_MAX_DAYS;
        if (!maxDays || maxDays <= 0) {
            throw Error.make(Error.Status.NOT_AVAILABLE,
                'Restore service is not available. Storage backup retention is not configured for this instance.');
        }
        const maxAgeMs = maxDays * 24 * 60 * 60 * 1000;
        if (Date.now() - ts.getTime() > maxAgeMs) {
            throw Error.make(Error.Status.BAD_REQUEST,
                `restorePointInTime must be within the last ${maxDays} days. `
                + `Point-in-time restore is only available for the past ${maxDays} days.`);
        }

        return { sdPath, restorePointInTime };
    }

    private static checkFeature(feature: Feature) {
        if (!FeatureFlags.isEnabled(feature)) {
            throw (Error.make(Error.Status.NOT_IMPLEMENTED, 'Method not implemented.'));
        }
    }

    /**
     * Checks if a deleted dataset has archived metadata entries that can be restored.
     */
    private static async checkArchiveContainerForDataset(
        sdPath: string, tenant: string): Promise<boolean> {
        try {
            return await AzureArchiveService.hasArchivedEntries(sdPath, tenant);
        } catch (error) {
            LoggerFactory.build(Config.CLOUDPROVIDER).error({
                message: `Failed to check archive container for dataset ${sdPath}: ${(error as any)?.message}`,
                context: 'RestorePush.checkArchive'
            });
            throw Error.make(Error.Status.NOT_AVAILABLE,
                'Unable to verify archived state for the dataset. Please try again later.');
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
            SubprojectAuth.getAuthGroups(subproject, AuthRoles.admin, tenant.esd),
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
                    'The dataset ' + SDPath.build(
                        dataset.tenant, dataset.subproject, dataset.path, dataset.name) + ' does not exist'));
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
