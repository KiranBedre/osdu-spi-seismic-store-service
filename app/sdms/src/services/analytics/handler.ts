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

import { Error, Feature, FeatureFlags, Response } from '../../shared';
import { Config, JournalFactoryTenantClient, StorageFactory } from '../../cloud';

import { AnalyticsGroups, JobModel } from '.';
import { Auth, AuthRoles } from '../../auth';
import { CredentialsFactory, IAccessTokenModel } from '../../cloud/credentials';
import { Request as expRequest, Response as expResponse } from 'express';
import { SubProjectDAO, SubProjectModel } from '../subproject';
import { TenantDAO, TenantModel } from '../tenant';

import { AnalyticsDAO } from './dao';
import { AnalyticsOP } from './optype';
import { AnalyticsParser } from './parser';
import { DESEntitlement } from '../../dataecosystem';

export class AnalyticsHandler {

    // handler for the [ /analytics ] endpoints
    public static async handler(req: expRequest, res: expResponse, op: AnalyticsOP) {

        if(FeatureFlags.isEnabled(Feature.ANALYTICS)) {
            try {

                const partitionId = req.get('data-partition-id');
                if (partitionId === undefined) {
                    const message:string = 'missing \"data-partition-id\" in header';
                    throw Error.make( Error.Status.BAD_REQUEST, message);
                }
                const tenant = await TenantDAO.get(partitionId);

                switch (op) {
                    case AnalyticsOP.CREATE:
                        Response.writeOK(res, await this.create(req, tenant));
                        break;
                    case AnalyticsOP.LIST_REPORTS:
                        Response.writeOK(res, await this.listReports(req, tenant));
                        break;
                    case AnalyticsOP.LIST_SCHEDULES:
                        Response.writeOK(res, await this.listSchedules(req, tenant));
                        break;
                    case AnalyticsOP.DELETE:
                        Response.writeOK(res, await this.delete(req, tenant));
                        break;
                    case AnalyticsOP.DOWNLOAD_CONNECTION_STRING:
                        Response.writeOK(res, await this.getConnectionString(req, tenant));
                        break;
                    default:
                        throw (Error.make(Error.Status.UNKNOWN, 'Internal Server Error'));
                }

            } catch (error) { Response.writeError(res, error); }
        }
        else {
            const message:string = 'analytics endpoints not available';
            Response.write(res, Error.Status.BAD_REQUEST, message);
        }

    }

    // Add/update a job schedule
    // Required role: tenant admin
    //                data manager
    //                subproject admin
    private static async create(req: expRequest, tenant: TenantModel): Promise<JobModel[]> {

        // Parse input parameters
        const input = AnalyticsParser.create(req);

        // init journalClient client
        const journalClient = JournalFactoryTenantClient.get(tenant);

        const subproject: SubProjectModel = await SubProjectDAO.get(journalClient, tenant.name, input[0].name);

        // Check authorization
        await AnalyticsHandler.authorizationCheck(req, tenant, subproject);

        // Register the job
        await AnalyticsDAO.create(journalClient, tenant.name, input[0]);

        return input;
    }

    // list job reports
    // Required role: tenant admin
    //                data manager
    //                subproject admin
    private static async listReports(req: expRequest, tenant: TenantModel) {

        const args = AnalyticsParser.list(req);

        // init journalClient client and key
        const journalClient = JournalFactoryTenantClient.get(tenant);

        // Check authorization
        try {
            // if subproject exist
            const subproject: SubProjectModel = await SubProjectDAO.get(journalClient, tenant.name, args.subproject);
            await AnalyticsHandler.authorizationCheck(req, tenant, subproject);
        } catch (error) {
            if (error.error.code === 404) {
                // check if user is tenant admin or data manager
                await AnalyticsHandler.authorizationCheck(req, tenant);
            }
            else {
                throw error;
            }
        }

        // retrieve the sdms analytics reports
        const storage = StorageFactory.build(Config.CLOUDPROVIDER, tenant);
        let prefix = args.subproject;
        if (args.year) {
            prefix += '/' + args.year;
        }
        if (args.month) {
            prefix += '/' + args.month;
        }
        if (args.day) {
            prefix += '/' + args.day;
        }
        const reports = await storage.listBlobs(prefix);
        return reports;
    }

    // List all job schedules
    // Required role: tenant admin
    //                data manager
    //                subproject admin
    private static async listSchedules(req: expRequest, tenant: TenantModel): Promise<JobModel[]> {

        // init journalClient client
        const journalClient = JournalFactoryTenantClient.get(tenant);

        // list the jobs
        const list = await AnalyticsDAO.list(journalClient, tenant.name);

        try {
            // if tenant admin or data manager return complete list
            await AnalyticsHandler.authorizationCheck(req, tenant);
            return list;
        } catch (error) {
            // if else return filtered list
            const userGroups = await DESEntitlement.getUserGroups(
                req.headers.authorization, tenant.name, req[Config.DE_FORWARD_APPKEY]);
            const userGroupEmailsList = userGroups.map(group => group.email);

            let finalList = await AnalyticsHandler.filterBySubproject(journalClient, tenant, userGroupEmailsList, list);
            finalList = [...new Set(finalList)];
            return finalList;
        }
    }

    // Delete a existing job schedule
    // Required role: tenant admin
    //                data manager
    //                subproject admin
    private static async delete(req: expRequest, tenant: TenantModel) {

        // init journalClient client
        const journalClient = JournalFactoryTenantClient.get(tenant);

        // Parse input parameters
        const input = AnalyticsParser.delete(req);

        // Check authorization
        try {
            // if subproject exist
            const subproject: SubProjectModel = await SubProjectDAO.get(journalClient, tenant.name, input);
            await AnalyticsHandler.authorizationCheck(req, tenant, subproject);
        } catch (error) {
            if (error.error.code === 404) {
                // check if user is tenant admin or data manager
                await AnalyticsHandler.authorizationCheck(req, tenant);
            }
            else {
                throw error;
            }
        }

        try {
            await AnalyticsDAO.delete(journalClient, tenant.name, input);
        } catch (error) {
            if (error.code !== 404) {
                throw error;
            }
        }
    }

    // get connection string for report
    // Required role: tenant admin
    //                data manager
    //                subproject admin
    private static async getConnectionString(req: expRequest, tenant: TenantModel): Promise<IAccessTokenModel> {

        const args = AnalyticsParser.connectionString(req);

        // init journalClient client and key
        const journalClient = JournalFactoryTenantClient.get(tenant);

        // Check authorization
        try {
            // if subproject exist
            const subproject: SubProjectModel = await SubProjectDAO.get(journalClient, tenant.name, args.subproject);
            await AnalyticsHandler.authorizationCheck(req, tenant, subproject);
        } catch (error) {
            if (error.error.code === 404) {
                // check if user is tenant admin or data manager
                await AnalyticsHandler.authorizationCheck(req, tenant);
            }
            else {
                throw error;
            }
        }

        // generate and return the connection credentials string
        // need to construct the virtualFolder base on filter-date
        let virtualFolder = args.subproject;
        if (args.year) {
            virtualFolder += '/' + args.year;
        }
        if (args.month) {
            virtualFolder += '/' + args.month;
        }
        if (args.day) {
            virtualFolder += '/' + args.day;
        }

        return await CredentialsFactory.build(Config.CLOUDPROVIDER).getStorageCredentials(
            tenant.name,
            args.subproject,
            Config.SDMS_ANALYTICS_CONTAINER_NAME,
            true,
            tenant.name,
            virtualFolder);
    }

    private static async authorizationCheck(req: expRequest, tenant: TenantModel, subproject?: SubProjectModel) {

        if (subproject) {
            await Auth.isUserAuthorized(
                req.headers.authorization, AnalyticsGroups.getAuthGroups(tenant, subproject, AuthRoles.admin),
                tenant.esd, req[Config.DE_FORWARD_APPKEY]);
        }
        else {
            await Auth.isUserAuthorized(
                req.headers.authorization, AnalyticsGroups.getTenantManagerAuthGroups(tenant),
                tenant.esd, req[Config.DE_FORWARD_APPKEY]);
        }
    }

    private static async filterBySubproject(
        journalClient: any,
        tenant: TenantModel,
        userGroupEmailsList: string[],
        listOfJobs: JobModel[]
    ): Promise<JobModel[]> {

        const finalList = [];
        await Promise.all(listOfJobs.map(async job => {
            try {
                const subproject: SubProjectModel = await SubProjectDAO.get(journalClient, tenant.name, job.name);
                const subprojectGroups = AnalyticsGroups.getSubprojectAuthGroups(subproject, AuthRoles.admin);
                for (const aclGroup of subprojectGroups) {
                    if (userGroupEmailsList.indexOf(aclGroup) !== -1) {
                        finalList.push(job);
                    }
                }
            } catch (error) {
                if (error.error.code !== 404) { throw error; }
            }
          }));

        return finalList;
    }
}
