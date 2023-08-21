// ============================================================================
// Copyright 2017-2021, Schlumberger
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

import { DeleteJobRedisStore } from './redis';
import { Request as expRequest, Response as expResponse } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { SubprojectAuth, SubProjectModel, IDeleteOperationModel, IDeleteOperationStatusModel } from '.';
import { Auth, AuthGroups, AuthRoles, UserRoles } from '../../auth';
import { Config, JournalFactoryTenantClient, LoggerFactory, StorageFactory } from '../../cloud';
import { SeistoreFactory } from '../../cloud/seistore';
import { DESUtils } from '../../dataecosystem';
import { UserAssociationServiceFactory } from '../../dataecosystem';
import { Error, Feature, FeatureFlags, Response, Utils } from '../../shared';
import { DatasetDAO, PaginationModel } from '../dataset';
import { TenantAuth, TenantModel, TenantGroups } from '../tenant';
import { TenantDAO } from '../tenant/dao';
import { SubProjectDAO } from './dao';
import { SubprojectGroups } from './groups';
import { SubProjectOP } from './optype';
import { SubProjectParser } from './parser';
import { IDeleteOperationQueueTaskModel } from './model';

export class SubProjectHandler {

    // handler for the [ /subproject ] endpoints
    public static async handler(req: expRequest, res: expResponse, op: SubProjectOP) {

        try {
            // subproject endpoints are not available with impersonation token
            if (Auth.isImpersonationToken(req.headers.authorization)) {
                throw (Error.make(Error.Status.PERMISSION_DENIED,
                    'subproject endpoints not available' +
                    ' with an impersonation token as Auth credentials.'));
            }

            const tenant = await TenantDAO.get(req.params.tenantid);

            if (op === SubProjectOP.Create) {

                const subproject = await this.create(req, tenant);
                delete (subproject as any).service_account; // we don't want to return it
                Response.writeOK(res, subproject);

            } else if (op === SubProjectOP.Get) {

                const subproject = await this.get(req, tenant);
                delete (subproject as any).service_account; // we don't want to return it
                Response.writeOK(res, subproject);

            } else if (op === SubProjectOP.Delete) {

                await this.delete(req, tenant);
                Response.writeOK(res);

            } else if (op === SubProjectOP.BulkDelete) {

                const operationId = await this.bulkDelete(req, tenant);
                Response.writeOK(res, operationId, 202);

            } else if (op === SubProjectOP.BulkDeleteStatus) {

                const status = await this.bulkDeleteStatus(req, tenant);
                Response.writeOK(res, status);

            } else if (op === SubProjectOP.Patch) {

                const subproject = await this.patch(req, tenant);
                delete (subproject as any).service_account; // we don't want to return it
                Response.writeOK(res, subproject);

            } else if (op === SubProjectOP.List) {

                const subprojects = await this.list(req, tenant);
                for (const item of subprojects) { delete (item as any).service_account; } // we don't want to return it
                Response.writeOK(res, subprojects);

            } else { throw (Error.make(Error.Status.UNKNOWN, 'Internal Server Error')); }

        } catch (error) { Response.writeError(res, error); }

    }

    // Create a new subproject data group
    // Required role: tenant.admin
    private static async create(req: expRequest, tenant: TenantModel): Promise<SubProjectModel> {

        // Parse input parameters
        const subproject = await SubProjectParser.create(req);
        const userToken = req.headers.authorization;

        // enforce the datasets schema by key for newly create subproject
        // this will mainly affect google for which the initial implementation
        // of the journal was query-based (lack in performance)
        // other cloud providers already implement ref by key.
        subproject.enforce_key = Config.ENFORCE_SCHEMA_BY_KEY;

        // Check if user is a tenant admin
        await Auth.isUserAuthorized(
            userToken, TenantAuth.getAuthGroups(tenant), tenant.esd, req[Config.DE_FORWARD_APPKEY]);

        if (subproject.ltag) {
            // Check if the legal tag is valid
            await Auth.isLegalTagValid(req.headers.authorization,
                subproject.ltag, tenant.esd, req[Config.DE_FORWARD_APPKEY]);
        }

        // init journalClient client
        const journalClient = JournalFactoryTenantClient.get(tenant);

        // Check if the subproject already exists
        Config.disableStrongConsistencyEmulation();
        if (await SubProjectDAO.exist(journalClient, subproject.tenant, subproject.name)) {
            throw (Error.make(Error.Status.ALREADY_EXISTS,
                'The subproject ' + subproject.name +
                ' already exists in the tenant project ' + subproject.tenant));
        }
        Config.enableStrongConsistencyEmulation();

        // if no admins acl are specified, create a default data group for manage them
        if(subproject.acls?.admins?.length === 0) {
            const uuid = uuidv4();
            const group = SubprojectGroups.dataAdminGroup(tenant.name, subproject.name, tenant.esd, uuid);
            const groupName = group.split('@')[0];
            SubProjectHandler.validateGroupNameLength(groupName, subproject);
            await AuthGroups.createGroup(userToken, groupName,
                'seismic dms tenant ' + tenant.name + ' subproject ' + subproject.name + ' admin group',
                tenant.esd, req[Config.DE_FORWARD_APPKEY]);
            subproject.acls.admins = [ group ];
        }
        // if no viewers acls are specified, create a default data group for manage them
        if(subproject.acls?.viewers?.length === 0 ) {
            const uuid = uuidv4();
            const group = SubprojectGroups.dataViewerGroup(tenant.name, subproject.name, tenant.esd, uuid);
            const groupName = group.split('@')[0];
            SubProjectHandler.validateGroupNameLength(groupName, subproject);
            await AuthGroups.createGroup(userToken, groupName,
                'seismic dms tenant ' + tenant.name + ' subproject ' + subproject.name + ' viewer group',
                tenant.esd, req[Config.DE_FORWARD_APPKEY]);
            subproject.acls.viewers = [ group ];

        }

        // Create the storage resource
        subproject.gcs_bucket = await this.getBucketName(tenant);
        await SeistoreFactory.build(Config.CLOUDPROVIDER).getSubprojectStorageResources(tenant, subproject);

        // Register the subproject
        await SubProjectDAO.register(journalClient, subproject);

        // if additional admin user is passed in the request body
        if (req.body?.admin && req.body?.admin !== Utils.getPropertyFromTokenPayload(
            userToken, Config.USER_ID_CLAIM_FOR_ENTITLEMENTS_SVC)) {
            await Promise.all([
                AuthGroups.addUserToGroup(userToken, subproject.acls.admins[0], req.body.admin,
                    tenant.esd, req[Config.DE_FORWARD_APPKEY], UserRoles.Owner, true),
                AuthGroups.addUserToGroup(userToken, subproject.acls.viewers[0], req.body.admin,
                    tenant.esd, req[Config.DE_FORWARD_APPKEY], UserRoles.Owner, true)
            ]);

        }

        const status = await SeistoreFactory.build(Config.CLOUDPROVIDER).notifySubprojectCreationStatus(subproject, 'created');

        if (!status) {
            LoggerFactory.build(Config.CLOUDPROVIDER)
                .error('Unable to publish creation status for subproject ' + subproject.name);
        }

        return subproject;
    }

    // Get the subproject data group metadata
    // Required role: subproject.admin
    private static async get(req: expRequest, tenant: TenantModel): Promise<SubProjectModel> {
        // init journalClient client
        const journalClient = JournalFactoryTenantClient.get(tenant);
        // [NOTE OF DEPRECATION] subid-to-email to deprecated in favor of translate-user-info
        let userInfo = true;
        if(req.query['translate-user-info'] === 'false' || req.query['subid-to-email'] === 'false') {
            userInfo = false;
        }
        const convertSubIdToEmail = userInfo;
        let subproject: SubProjectModel;

        try {
            subproject = await SubProjectDAO.get(journalClient, tenant.name, req.params.subprojectid);
        } catch(error) {
            await Auth.isUserAuthorized(req.get('authorization'),
                [TenantGroups.userGroup(tenant.esd)], tenant.esd, req[Config.DE_FORWARD_APPKEY]);
            throw error;
        }

        // Check if user is member of any of the subproject acl admin groups
        await Auth.isUserAuthorized(req.headers.authorization,
            SubprojectAuth.getAuthGroups(subproject, AuthRoles.admin), tenant.esd, req[Config.DE_FORWARD_APPKEY]);



        // Check if the legal tag is valid
        if (subproject.ltag) {
            // [TODO] we should always have ltag. some subprojects does not have it (the old ones)
            await Auth.isLegalTagValid(req.headers.authorization,
                subproject.ltag, tenant.esd, req[Config.DE_FORWARD_APPKEY]);
        }


        if (FeatureFlags.isEnabled(Feature.CCM_INTERACTION) && convertSubIdToEmail) {
            if (!Utils.isEmail(subproject.admin)) {
                const dataPartition = DESUtils.getDataPartitionID(tenant.esd);
                subproject.admin = await UserAssociationServiceFactory.build(Config.USER_ASSOCIATION_SVC_PROVIDER)
                    .convertPrincipalIdentifierToUserInfo(subproject.admin, dataPartition);
            }
        }

        return subproject;

    }

    // delete the subproject resource
    // required roles: [tenant.admin]
    private static async delete(req: expRequest, tenant: TenantModel) {

        // request inputs
        const subprojectName = req.params.subprojectid;

        const journalClient = JournalFactoryTenantClient.get(tenant);
        const subproject = await SubProjectDAO.get(journalClient, tenant.name, subprojectName);

        // auth check: tenant.admin
        await Auth.isUserAuthorized(
            req.headers.authorization, TenantAuth.getAuthGroups(tenant),
            tenant.esd, req[Config.DE_FORWARD_APPKEY]);


        // 1. delete subproject and dataset metadata
        await Promise.all([
            SubProjectDAO.delete(journalClient, tenant.name, subproject.name),
            DatasetDAO.deleteAll(journalClient, tenant.name, subproject.name),
        ]);

        // 2. delete default authorization groups
        const dataGroupRegex = SubprojectGroups.dataGroupNameRegExp(tenant.name, subproject.name);
        const adminSubprojectDataGroups = subproject.acls.admins.filter((group) => group.match(dataGroupRegex));
        const viewerSubprojectDataGroups = subproject.acls.viewers.filter(group => group.match(dataGroupRegex));
        const subprojectDataGroups = adminSubprojectDataGroups.concat(viewerSubprojectDataGroups);
        for (const group of subprojectDataGroups) {
            Utils.exponentialBackOff(AuthGroups.deleteGroup(
                req.headers.authorization, group, tenant.esd,
                req[Config.DE_FORWARD_APPKEY])).catch((error)=>{
                    console.error(error);
                });

        }


        // 3. delete the storage resources (files and bucket)
        SeistoreFactory.build(Config.CLOUDPROVIDER).deleteStorageResources(tenant, subproject).catch((error) => {
            LoggerFactory.build(Config.CLOUDPROVIDER).error(JSON.stringify(error));
        });

    }

    // delete datasets in a given path within the subproject 
    private static async bulkDelete(req: expRequest, tenant: TenantModel): Promise<IDeleteOperationModel> {
        
        const subprojectName = req.params.subprojectid;
        const path = SubProjectParser.bulkDelete(req);

        // auth check: tenant.admin
        await Auth.isUserAuthorized(
            req.headers.authorization, TenantAuth.getAuthGroups(tenant),
            tenant.esd, req[Config.DE_FORWARD_APPKEY]);

        const operationId = uuidv4();

        const operation: IDeleteOperationQueueTaskModel = {
            operation_id: operationId,
            tenant: tenant.name,
            subproject: subprojectName,
            path: path
        }

        await DeleteJobRedisStore.pushOperation(operation);

        return {
            operation_id: operationId
        };
    }
    
    // get status of a bulk delete operation
    private static async bulkDeleteStatus(req: expRequest, tenant: TenantModel): Promise<IDeleteOperationStatusModel> {

        const operationId = SubProjectParser.bulkDeleteStatus(req);
        const operationStatus = await DeleteJobRedisStore.getOperationStatus(operationId);

        return {
            operation_id: operationId,
            created_at: "",
            created_by: "",
            last_updated_at: "",
            status: "",
            dataset_cnt: 0,
            deleted_cnt: 0,
            failed_cnt: 0
        };
    }

    // Patch the subproject
    // Required role: subproject.admin
    private static async patch(req: expRequest, tenant: TenantModel) {

        const parsedUserInput = SubProjectParser.patch(req);

        // bad request if there are no field to patch
        if (!parsedUserInput.ltag) {
            throw (Error.make(Error.Status.BAD_REQUEST,
                'The request does not contain any field to patch'));
        }

        // init journalClient client and key
        const journalClient = JournalFactoryTenantClient.get(tenant);

        // get subproject
        let subproject: SubProjectModel;

        try {
            subproject = await SubProjectDAO.get(journalClient, tenant.name, req.params.subprojectid);
        } catch(error) {
            await Auth.isUserAuthorized(req.get('authorization'),
                [TenantGroups.userGroup(tenant.esd)], tenant.esd, req[Config.DE_FORWARD_APPKEY]);
            throw error;
        }

        // Check if user is a subproject admin
        await Auth.isUserAuthorized(req.headers.authorization,
            SubprojectAuth.getAuthGroups(subproject, AuthRoles.admin), tenant.esd, req[Config.DE_FORWARD_APPKEY]);

        // Updated the access policy
        if (parsedUserInput.access_policy) {
            this.validateAccessPolicy(parsedUserInput.access_policy, subproject.access_policy);
            subproject.access_policy = parsedUserInput.access_policy;
        }

        // save and replace default SDMS ACLs to delete at the end
        const dataGroupsToDelete = [] as string[];
        if (parsedUserInput?.acls?.admins?.length > 0) {
            const defaultDataGroupRegEx = SubprojectGroups.dataGroupNameRegExp(tenant.name, subproject.name);
            dataGroupsToDelete.concat(subproject.acls.admins.filter((group) => group.match(defaultDataGroupRegEx)));
            subproject.acls.admins = parsedUserInput.acls.admins;
        }
        if (parsedUserInput?.acls?.viewers?.length > 0) {
            const defaultDataGroupRegEx = SubprojectGroups.dataGroupNameRegExp(tenant.name, subproject.name);
            dataGroupsToDelete.concat(subproject.acls.viewers.filter((group) => group.match(defaultDataGroupRegEx)));
            subproject.acls.viewers = parsedUserInput.acls.viewers;
        }

        // update the legal tag (check if the new one is valid)
        if (parsedUserInput.ltag) {
            await Auth.isLegalTagValid(
                req.headers.authorization, parsedUserInput.ltag, tenant.esd, req[Config.DE_FORWARD_APPKEY]);

            const originalSubprojectLtag = subproject.ltag;
            if (originalSubprojectLtag !== parsedUserInput.ltag) {

                // update the subproject ltag
                subproject.ltag = parsedUserInput.ltag;
                // recursively update all datasets legal tag
                if (parsedUserInput.recursive) {
                    const pagination = { limit: 1000, cursor: undefined } as PaginationModel;
                    do {
                        const output = await DatasetDAO.listDatasets(
                            journalClient, subproject.tenant, subproject.name, pagination);
                        const datasets = output.datasets.filter(dataset => {
                            return dataset.data.ltag === originalSubprojectLtag;
                        });
                        for (const dataset of datasets) {
                            dataset.data.ltag = parsedUserInput.ltag;
                        }
                        if (datasets.length > 0) {
                            await DatasetDAO.updateAll(journalClient, datasets);
                        }
                        pagination.cursor = output.nextPageCursor;
                    } while (pagination.cursor);
                }

            }

        }

        // Update the subproject metadata
        await SubProjectDAO.register(journalClient, subproject);

        // delete replaced default data group ACLs (detached retry ops)
        for (const group of dataGroupsToDelete) {
            Utils.exponentialBackOff(AuthGroups.deleteGroup(
                req.headers.authorization, group, tenant.esd, req[Config.DE_FORWARD_APPKEY])).catch((error) => {
                    console.error(error);
                });
        }

        return subproject;
    }

    // List the subprojects in a tenant
    // Required role: tenant.admin
    private static async list(req: expRequest, tenant: TenantModel): Promise<SubProjectModel[]> {

        // Check if user is a tenant admin
        await Auth.isUserAuthorized(
            req.headers.authorization, TenantAuth.getAuthGroups(tenant),
            tenant.esd, req[Config.DE_FORWARD_APPKEY]);

        // init journalClient client
        const journalClient = JournalFactoryTenantClient.get(tenant);

        // Retrieve the subproject list
        const subprojects = await SubProjectDAO.list(journalClient, tenant.name);

        // check If legal tag is valid or remove from the list
        const results: SubProjectModel[] = [];
        const validatedLtag: string[] = [];
        for (const subproject of subprojects) {
            if (subproject.ltag) {
                // [TODO] we should always have ltag. some datasets does not have it (the old ones)
                if (validatedLtag.indexOf(subproject.ltag) !== -1) {
                    results.push(subproject);
                } else if (await Auth.isLegalTagValid(req.headers.authorization, subproject.ltag,
                    tenant.esd, req[Config.DE_FORWARD_APPKEY], false)) {
                    validatedLtag.push(subproject.ltag);
                    results.push(subproject);
                }
            } else {
                results.push(subproject);
            }
        }

        return results;

    }

    // Randomly generate a name for a bucket (check if not already in use)
    private static async getBucketName(tenant: TenantModel): Promise<string> {
        const storage = StorageFactory.build(Config.CLOUDPROVIDER, tenant);
        for (let i = 0; i < 5; i++) {
            const bucketName = await storage.randomBucketName();
            const bucketExists = await storage.bucketExists(bucketName);

            if (!bucketExists) {
                return bucketName;
            }
        }
        throw (Error.make(Error.Status.UNKNOWN, 'Unable to generate a bucket name'));
    }

    // Ensure the group name respect CSP imposed length limits
    private static validateGroupNameLength(groupName: string, subproject: SubProjectModel) {
        const allowedSubprojectLen = Config.DES_GROUP_CHAR_LIMIT - groupName.length;

        if (allowedSubprojectLen < 0) {
            const maxChar = subproject.name.length - Math.abs(allowedSubprojectLen);
            throw (Error.make(Error.Status.BAD_REQUEST,
                subproject.name + ' subproject name is too long (' +
                subproject.name.length + ' characters), for the ' + subproject.tenant + ' tenant. ' +
                'The subproject name must not be longer than ' + maxChar + ' characters'));
        }
    }

    // Ensure the access policy is not changed if already set as 'dataset'
    private static validateAccessPolicy(userInputAccessPolicy: string, existingAccessPolicy: string) {
        if (existingAccessPolicy === 'dataset' && userInputAccessPolicy === 'uniform') {
            throw (Error.make(Error.Status.BAD_REQUEST,
                'Subproject access policy cannot be changed from dataset level to uniform level'));
        }

    }
}
