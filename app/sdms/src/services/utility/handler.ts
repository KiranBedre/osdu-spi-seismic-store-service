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

import Bull from 'bull';
import { Request as expRequest, Response as expResponse } from 'express';
import { Auth, AuthRoles } from '../../auth';
import { Config, CredentialsFactory, JournalFactoryTenantClient, StorageFactory } from '../../cloud';
import { IAccessTokenModel } from '../../cloud/credentials';
import { IDESEntitlementGroupModel } from '../../cloud/dataecosystem';
import { SeistoreFactory } from '../../cloud/seistore';
import { StorageJobManager } from '../../cloud/shared/queue';
import { DESEntitlement, DESStorage, DESUtils } from '../../dataecosystem';
import { Error, Feature, FeatureFlags, Response, Utils } from '../../shared';
import { DatasetAuth, DatasetDAO, DatasetModel, DatasetUtils } from '../dataset';
import { IWriteLockSession, Locker } from '../dataset/locker';
import { SubprojectAuth, SubProjectDAO } from '../subproject';
import { TenantDAO } from '../tenant';
import { UtilityOP } from './optype';
import { UtilityParser } from './parser';


export class UtilityHandler {

    // handler for the [ /utility ] endpoints
    public static async handler(req: expRequest, res: expResponse, op: UtilityOP) {

        try {
            if (op === UtilityOP.GCSTOKEN) {
                Response.writeOK(res, await this.getGCSAccessToken(req));
            } else if (op === UtilityOP.LS) {
                Response.writeOK(res, await this.ls(req));
            } else if (op === UtilityOP.CP) {
                const response = await this.cp(req);
                Response.writeOK(res, { 'status': response.status }, response.code);
            } else if (op === UtilityOP.UPLOAD_CONNECTION_STRING) {
                Response.writeOK(res, await this.getConnectionString(req, false));
            } else if (op === UtilityOP.DOWNLOAD_CONNECTION_STRING) {
                Response.writeOK(res, await this.getConnectionString(req, true));
            } else if (op === UtilityOP.STORAGE_TIERS) {
                Response.writeOK(res, await this.listStorageTiers(req));
            } else {
                throw (Error.make(Error.Status.UNKNOWN, 'Internal Server Error'));
            }
        } catch (error) { Response.writeError(res, error); }

    }

    // ------------------------------------------------------------------
    // get the connection credentials string token
    //
    // Required role:
    //
    //  - for connection string with subproject access:
    //    - read write access request: subproject.admin
    //    - read only access request: subproject.viewer
    //
    //  - for connection string with dataset access:
    //    - read write access request:
    //      - subproject.admin if the subproject access policy = uniform
    //      - dataset.admin  if the subproject access policy = dataset
    //    - read only access request:
    //      - subproject.viewer if the subproject access policy = uniform
    //      - dataset.viewer if the subproject access policy = dataset
    // ------------------------------------------------------------------
    private static async getConnectionString(req: expRequest, readOnly: boolean): Promise<IAccessTokenModel> {

        const requestDataset = UtilityParser.connectionString(req);
        const tenant = await TenantDAO.get(requestDataset.tenant);
        const journalClient = JournalFactoryTenantClient.get(tenant);
        const subproject = await SubProjectDAO.get(journalClient, requestDataset.tenant, requestDataset.subproject);
        const dataPartitionId = DESUtils.getDataPartitionID(tenant.esd);

        let bucket: string;
        let virtualFolder: string;
        let authGroups: string[];

        if (requestDataset.name) { // dataset connection strings

            const dataset = subproject.enforce_key ?
                await DatasetDAO.getByKey(journalClient, requestDataset) :
                (await DatasetDAO.get(journalClient, requestDataset))[0];

            authGroups = DatasetAuth.getAuthGroups(subproject, dataset, readOnly ? AuthRoles.viewer : AuthRoles.admin);
            bucket = DatasetUtils.getBucketFromDatasetResourceUri(dataset.gcsurl);
            virtualFolder = DatasetUtils.getVirtualFolderFromDatasetResourceUri(dataset.gcsurl);

        } else { // subproject connection string

            authGroups = SubprojectAuth.getAuthGroups(subproject, readOnly ? AuthRoles.viewer : AuthRoles.admin);
            bucket = subproject.gcs_bucket;

        }

        // authorize the call
        readOnly ?
            await Auth.isReadAuthorized(req.headers.authorization,
                authGroups,
                tenant, subproject.name, req[Config.DE_FORWARD_APPKEY],
                req.headers['impersonation-token-context'] as string) :
            await Auth.isWriteAuthorized(req.headers.authorization,
                authGroups,
                tenant, subproject.name, req[Config.DE_FORWARD_APPKEY],
                req.headers['impersonation-token-context'] as string);

        // generate and return the connection credentials string
        return await CredentialsFactory.build(Config.CLOUDPROVIDER).getStorageCredentials(
            subproject.tenant, subproject.name, bucket, readOnly, dataPartitionId, virtualFolder);

    }

    // Generate the storage access token
    // Required role:
    //  - for subproject path request:
    //    - read write access request: subproject.admin
    //    - read only access request: subproject.viewer
    //  - for dataset path request:
    //    - read write request: subproject.viewer || dataset.viewer (dependents on applied access policy)
    //    - read only request: subproject.admin || dataset.admin (dependents on applied access policy)
    private static async getGCSAccessToken(req: expRequest) {

        const inputParams = UtilityParser.gcsToken(req);
        const sdPath = inputParams.sdPath;
        const readOnly = inputParams.readOnly;

        const tenant = await TenantDAO.get(sdPath.tenant);
        const journalClient = JournalFactoryTenantClient.get(tenant);
        const subproject = await SubProjectDAO.get(journalClient, sdPath.tenant, sdPath.subproject);

        // subproject access request
        if (Object.keys(inputParams.dataset).length === 0) {
            if(subproject.access_policy === Config.DATASET_ACCESS_POLICY){
                throw (Error.make(Error.Status.BAD_REQUEST,'Please provide dataset path'));
            }

            readOnly ?
                await Auth.isReadAuthorized(req.headers.authorization,
                    SubprojectAuth.getAuthGroups(subproject, AuthRoles.viewer),
                    tenant, subproject.name, req[Config.DE_FORWARD_APPKEY],
                    req.headers['impersonation-token-context'] as string) :
                await Auth.isWriteAuthorized(req.headers.authorization,
                    SubprojectAuth.getAuthGroups(subproject, AuthRoles.admin),
                    tenant, subproject.name, req[Config.DE_FORWARD_APPKEY],
                    req.headers['impersonation-token-context'] as string);

            return await CredentialsFactory.build(Config.CLOUDPROVIDER).getStorageCredentials(
                subproject.tenant, subproject.name,
                subproject.gcs_bucket, readOnly, DESUtils.getDataPartitionID(tenant.esd));


        } else { // dataset access request

            const dataset = subproject.enforce_key ?
                await DatasetDAO.getByKey(journalClient, inputParams.dataset) :
                (await DatasetDAO.get(journalClient, inputParams.dataset))[0];

            readOnly ?
                await Auth.isReadAuthorized(req.headers.authorization,
                    DatasetAuth.getAuthGroups(subproject, dataset, AuthRoles.viewer),
                    tenant, subproject.name, req[Config.DE_FORWARD_APPKEY],
                    req.headers['impersonation-token-context'] as string) :
                await Auth.isWriteAuthorized(req.headers.authorization,
                    DatasetAuth.getAuthGroups(subproject, dataset, AuthRoles.admin),
                    tenant, subproject.name, req[Config.DE_FORWARD_APPKEY],
                    req.headers['impersonation-token-context'] as string);

            const bucket = DatasetUtils.getBucketFromDatasetResourceUri(dataset.gcsurl);
            const virtualFolder = DatasetUtils.getVirtualFolderFromDatasetResourceUri(dataset.gcsurl);
            return await CredentialsFactory.build(Config.CLOUDPROVIDER).getStorageCredentials(
                subproject.tenant, subproject.name, bucket, readOnly,
                DESUtils.getDataPartitionID(tenant.esd), virtualFolder);

        }


    }

    // List SDMS uri content
    // Required role:
    //  - for list accessible tenants: any
    //  - for list accessible subproject: any
    //  - for list accessible subproject content: subproject.viewer
    private static async ls(req: expRequest) {

        const inputArgs = UtilityParser.ls(req);

        // list accessible tenants for sdPaths <sd://>
        if (!inputArgs.sdPath.tenant) {
            const tenants = await TenantDAO.getAll();
            const partitions = tenants
                .map((t) => DESUtils.getDataPartitionID(t.esd))
                .filter((val, index, self) => self.indexOf(val) === index);

            // Fetch all entitlements for each unique tenant that the user has access to
            const entitlementCalls = [];
            for (const partition of partitions) {
                try {
                    entitlementCalls.push(await DESEntitlement.getUserGroups(
                        req.headers.authorization, partition, req[Config.DE_FORWARD_APPKEY]));
                } catch (error) { continue; }
            }

            // Filter tenants which the user does not belong
            let groups = entitlementCalls.reduce(
                (carry, groupList) => carry.concat(groupList), []) as IDESEntitlementGroupModel[];
            groups = groups.filter(group => this.isValidEntitlementGroup(group)); // only valid seismic-dsm group
            const listTenants: string[] = groups.map((group) => {
                return group.name.startsWith(Config.SERVICEGROUPS_PREFIX) ?
                    group.name.split('.')[3] : group.name.split('.')[2];
            }); // tenant name
            return listTenants.filter((item, pos, self) => self.indexOf(item) === pos); // make unique

        }

        // list the tenant subprojects for sdPaths <sd://tenant>
        const tenant = await TenantDAO.get(inputArgs.sdPath.tenant);

        // Create  tenant journalClient client
        const journalClient = JournalFactoryTenantClient.get(tenant);

        if (!inputArgs.sdPath.subproject) {
            let subprojects = [];
            const entitlementTenant = DESUtils.getDataPartitionID(tenant.esd);
            const userGroups = await DESEntitlement.getUserGroups(
                req.headers.authorization, entitlementTenant, req[Config.DE_FORWARD_APPKEY]);
            const userGroupEmailsList = userGroups.map(group => group.email);

            const registeredSubprojectsList = await SubProjectDAO.list(journalClient, inputArgs.sdPath.tenant);

            for (const registeredSubproject of registeredSubprojectsList) {
                if (registeredSubproject.acls) {
                    const aclGroups = registeredSubproject.acls.admins.concat(registeredSubproject.acls.viewers);
                    for (const aclGroup of aclGroups) {
                        if (userGroupEmailsList.indexOf(aclGroup) !== -1) {
                            subprojects.push(registeredSubproject);
                        }
                    }
                }
            }
            subprojects = [...new Set(subprojects)];
            return subprojects.map(sp => sp.name);
        }

        // list the folder content for sdPaths <sd://tenant/subproject>
        const dataset = {} as DatasetModel;
        dataset.tenant = inputArgs.sdPath.tenant;
        dataset.subproject = inputArgs.sdPath.subproject;
        dataset.path = inputArgs.sdPath.path || '/';

        const subproject = await SubProjectDAO.get(journalClient, dataset.tenant, dataset.subproject);

        //  Check if user is authorized
        await Auth.isReadAuthorized(req.headers.authorization,
            SubprojectAuth.getAuthGroups(subproject, AuthRoles.viewer),
            tenant, inputArgs.sdPath.subproject, req[Config.DE_FORWARD_APPKEY],
            req.headers['impersonation-token-context'] as string);


        if (inputArgs.pagination) {
            // Retrieve paginated content list
            return await DatasetDAO.paginatedListContent(
                journalClient, dataset, inputArgs.workingMode, inputArgs.pagination);
        }

        // Retrieve complete content list
        const results = await DatasetDAO.listContent(journalClient, dataset, inputArgs.workingMode);
        return (
            (inputArgs.workingMode === Config.LS_MODE.ALL ||
                inputArgs.workingMode === Config.LS_MODE.DIRS) ?
                results.directories : []).concat(
                    (inputArgs.workingMode === Config.LS_MODE.ALL ||
                        inputArgs.workingMode === Config.LS_MODE.DATASETS) ?
                        results.datasets : []);
    }


    // Copy datasets (same tenancy required)
    // Required role:
    //   - source subproject.viewer || dataset.viewer (dependents on applied access policy)
    //   - destination subproject.admin
    private static async cp(req: expRequest) {

        enum TransferStatus {
            InProgress = 'InProgress',
            Completed = 'Completed',
            Aborted = 'Aborted'
        }

        const userInputs = UtilityParser.cp(req);
        const sdPathFrom = userInputs.sdPathFrom;
        const sdPathTo = userInputs.sdPathTo;
        let copyJob: Bull.Job;
        let preRegisteredDataset: DatasetModel;
        let writeLockSession: IWriteLockSession;

        const tenant = await TenantDAO.get(sdPathFrom.tenant);

        // init journalClient client
        const journalClient = JournalFactoryTenantClient.get(tenant);

        // retrieve the destination subproject info
        const subproject = await SubProjectDAO.get(journalClient, sdPathTo.tenant, sdPathTo.subproject);

        // retrieve the source dataset
        let datasetFrom = {} as DatasetModel;
        datasetFrom.tenant = sdPathFrom.tenant;
        datasetFrom.subproject = sdPathFrom.subproject;
        datasetFrom.path = sdPathFrom.path;
        datasetFrom.name = sdPathFrom.dataset;

        // Retrieve the dataset metadata
        datasetFrom = subproject.enforce_key ?
            await DatasetDAO.getByKey(journalClient, datasetFrom) :
            (await DatasetDAO.get(journalClient, datasetFrom))[0];

        // check if the dataset does not exist
        if (!datasetFrom) {
            throw (Error.make(Error.Status.NOT_FOUND,
                'The dataset ' + Config.SDPATHPREFIX + sdPathFrom.tenant + '/' + sdPathFrom.subproject +
                sdPathFrom.path + sdPathFrom.dataset + ' does not exist exist'));
        }

        await Promise.all([
            Auth.isReadAuthorized(req.headers.authorization,
                DatasetAuth.getAuthGroups(subproject, datasetFrom, AuthRoles.viewer),
                tenant, sdPathFrom.subproject, req[Config.DE_FORWARD_APPKEY],
                req.headers['impersonation-token-context'] as string),
            await Auth.isWriteAuthorized(req.headers.authorization,
                SubprojectAuth.getAuthGroups(subproject, AuthRoles.admin),
                tenant, sdPathTo.subproject, req[Config.DE_FORWARD_APPKEY],
                req.headers['impersonation-token-context'] as string)]);

        let seismicmeta: any;

        if (datasetFrom.seismicmeta_guid) {

            seismicmeta = await DESStorage.getRecord(req.headers.authorization, datasetFrom.seismicmeta_guid,
                tenant.esd, req[Config.DE_FORWARD_APPKEY]);

            const guid = datasetFrom.seismicmeta_guid;
            const splitArray = guid.split(':');
            splitArray.pop();
            const guidSubString = splitArray.join(':');
            seismicmeta.id = guidSubString + ':' + Utils.makeID(16);
        }

        // build the destination dataset metadata
        const datasetTo = JSON.parse(JSON.stringify(datasetFrom)) as DatasetModel;
        datasetTo.tenant = sdPathTo.tenant;
        datasetTo.subproject = sdPathTo.subproject;
        datasetTo.name = sdPathTo.dataset;
        datasetTo.path = sdPathTo.path;
        datasetTo.last_modified_date = new Date().toString();
        // get the gcs account from the cloud provider
        datasetTo.gcsurl = await SeistoreFactory.build(
            Config.CLOUDPROVIDER).getDatasetStorageResource(tenant, subproject);
        datasetTo.ltag = datasetTo.ltag || subproject.ltag;
        datasetTo.sbit = Utils.makeID(16);
        datasetTo.sbit_count = 1;
        datasetTo.seismicmeta_guid = datasetFrom.seismicmeta_guid ? seismicmeta.id : undefined;
        datasetTo.transfer_status = TransferStatus.InProgress;

        if (datasetFrom.acls) {
            datasetTo.acls = datasetFrom.acls;
        }

        try {

            // check if a copy is already in progress from a previous request
            const lockKeyTo = datasetTo.tenant + '/' + datasetTo.subproject + datasetTo.path + datasetTo.name;
            const toDatasetLock = await Locker.getLock(lockKeyTo);

            preRegisteredDataset = subproject.enforce_key ?
                await DatasetDAO.getByKey(journalClient, datasetTo) :
                (await DatasetDAO.get(journalClient, datasetTo))[0];

            if (toDatasetLock && Locker.isWriteLock(toDatasetLock)) {

                if (preRegisteredDataset && 'transfer_status' in preRegisteredDataset &&
                    preRegisteredDataset.transfer_status === TransferStatus.InProgress) {
                    return {
                        'status': 'Copy operation is already in progress..',
                        'code': 202
                    };
                }
                else {
                    throw (Error.make(Error.Status.BAD_REQUEST,
                        'The dataset ' + Config.SDPATHPREFIX + sdPathTo.tenant + '/' + sdPathTo.subproject +
                        sdPathTo.path + sdPathTo.dataset + ' is write locked and cannot be copied'));
                }
            }

            if (preRegisteredDataset) {

                if ('transfer_status' in preRegisteredDataset) {
                    return {
                        'status': preRegisteredDataset.transfer_status,
                        'code': preRegisteredDataset.transfer_status === TransferStatus.Aborted ? 500 : 200
                    };
                }

                throw (Error.make(Error.Status.ALREADY_EXISTS,
                    'The dataset ' +
                    Config.SDPATHPREFIX + datasetTo.tenant + '/' +
                    datasetTo.subproject + datasetTo.path + datasetTo.name +
                    ' already exists'));
            }

            writeLockSession = await Locker.createWriteLock(lockKeyTo);

            // check if the source can be opened for read (no copy on writelock dataset)
            const lockKeyFrom = datasetFrom.tenant + '/' + datasetFrom.subproject + datasetFrom.path + datasetFrom.name;
            const fromDatasetLock = await Locker.getLock(lockKeyFrom);

            if (fromDatasetLock && Locker.isWriteLock(fromDatasetLock)) {
                throw (Error.make(Error.Status.BAD_REQUEST,
                    'The dataset ' + Config.SDPATHPREFIX + sdPathFrom.tenant + '/' + sdPathFrom.subproject +
                    sdPathFrom.path + sdPathFrom.dataset + ' is write locked and cannot be copied'));
            }

            // apply the read lock on the source if requested
            let readlock: { id: string, cnt: number; };

            if (userInputs.lock) {
                readlock = await Locker.acquireReadLock(lockKeyFrom);
            }


            // Check if legal tag of the source is valid
            if (datasetFrom.ltag) {
                // [TODO] we should always have ltag. some datasets does not have it (the old ones)
                await Auth.isLegalTagValid(req.headers.authorization, datasetFrom.ltag,
                    tenant.esd, req[Config.DE_FORWARD_APPKEY]);
            }

            // Check if legal tag of the destination is valid
            // [TODO] we should always have ltag. some datasets does not have it (the old ones)
            if (datasetTo.ltag && datasetTo.ltag !== datasetFrom.ltag) {
                await Auth.isLegalTagValid(req.headers.authorization, datasetTo.ltag,
                    tenant.esd, req[Config.DE_FORWARD_APPKEY]);
            }


            const datasetToEntityKey = journalClient.createKey({
                namespace: Config.SEISMIC_STORE_NS + '-' + datasetTo.tenant + '-' + datasetTo.subproject,
                path: [Config.DATASETS_KIND],
                enforcedKey: subproject.enforce_key ? (datasetTo.path.slice(0, -1) + '/' + datasetTo.name) : undefined
            });

            let storageKeyTo: any;
            if (datasetTo.seismicmeta_guid) {
                storageKeyTo = journalClient.createKey({
                    namespace: Config.SEISMIC_STORE_NS + '-' + datasetTo.tenant + '-' + datasetTo.subproject,
                    path: [Config.SEISMICMETA_KIND, datasetTo.path + datasetTo.name],
                });
            }

            // Register the dataset and lock the source if required
            await Promise.all([
                DatasetDAO.register(journalClient, { key: datasetToEntityKey, data: datasetTo }),
                (datasetTo.seismicmeta_guid && (FeatureFlags.isEnabled(Feature.SEISMICMETA_STORAGE))) ?
                    DESStorage.insertRecord(req.headers.authorization, [seismicmeta],
                        tenant.esd, req[Config.DE_FORWARD_APPKEY],
                        req.get(Config.USER_ID_HEADER_KEY_NAME) || await Utils.getUserId(req.headers.authorization))
                        : undefined,
            ]);

            // set the objects prefix
            const bucketFrom = DatasetUtils.getBucketFromDatasetResourceUri(datasetFrom.gcsurl);
            const prefixFrom = DatasetUtils.getVirtualFolderFromDatasetResourceUri(datasetFrom.gcsurl);
            const bucketTo = DatasetUtils.getBucketFromDatasetResourceUri(datasetTo.gcsurl);
            const prefixTo = DatasetUtils.getVirtualFolderFromDatasetResourceUri(datasetTo.gcsurl);

            // copy the objects
            const RETRY_MAX_ATTEMPTS = 10;

            copyJob = await StorageJobManager.copyJobsQueue.add({
                sourceBucket: bucketFrom,
                destinationBucket: bucketTo,
                datasetFrom,
                datasetTo,
                prefixFrom,
                prefixTo,
                tenant,
                subproject,
                readlockId: readlock ? readlock.id : null
            }, {
                attempts: RETRY_MAX_ATTEMPTS
            });

            // release the mutex but keep the lock
            await Locker.removeWriteLock(writeLockSession, true);

            return {
                'status': 'Copy in progress',
                'code': 202
            };

        } catch (err) {

            await Locker.removeWriteLock(writeLockSession);

            if (copyJob) {
                await copyJob.remove();
            }

            throw (err);
        }
    }

    private static listStorageTiers(req: expRequest): string[] {
        const storageProvider = StorageFactory.build(Config.CLOUDPROVIDER, null);
        return storageProvider.getStorageTiers();
    }

    // validate if the entitlement object follow the SDMS conventions
    private static isValidEntitlementGroup(el: IDESEntitlementGroupModel): boolean {
        return ((el.name.startsWith(Config.SERVICEGROUPS_PREFIX) || el.name.startsWith(Config.DATAGROUPS_PREFIX)) &&
            (el.name.endsWith(AuthRoles.admin) || el.name.endsWith(AuthRoles.editor)
                || el.name.endsWith(AuthRoles.viewer)));
    }

}
