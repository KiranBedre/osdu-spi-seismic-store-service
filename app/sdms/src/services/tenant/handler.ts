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

import { Request as expRequest, Response as expResponse } from 'express';
import { TenantAuth, TenantModel } from '.';
import { Auth } from '../../auth';
import { Config, JournalFactoryTenantClient } from '../../cloud';
import { Error, ErrorModel, Response } from '../../shared';
import { SubProjectDAO } from '../subproject';
import { TenantDAO } from './dao';
import { TenantOP } from './optype';
import { TenantParser } from './parser';

export class TenantHandler {

    // handler for the [ /tenant ] endpoints
    public static async handler(req: expRequest, res: expResponse, op: TenantOP) {

        try {

            // tenant endpoints are not available with impersonation token
            if (Auth.isImpersonationToken(req.headers.authorization)) {
                throw (Error.make(Error.Status.PERMISSION_DENIED,
                    'tenant endpoints not available' +
                    ' with an impersonation token as Auth credentials.'));
            }

            switch (op) {
                case TenantOP.CREATE:
                    Response.writeOK(res, await this.create(req));
                    break;
                case TenantOP.GET:
                    Response.writeOK(res, await this.get(req));
                    break;
                case TenantOP.DELETE:
                    Response.writeOK(res, await this.delete(req));
                    break;
                case TenantOP.GETSDPATH:
                    Response.writeOK(res, await this.getTenantSDPath(req));
                    break;
                default:
                    throw (Error.make(Error.Status.UNKNOWN, 'Internal Server Error'));
            }

        } catch (error) { Response.writeError(res, error); }

    }

    // Create a new tenant
    // Required role: tenant admin
    private static async create(req: expRequest): Promise<TenantModel> {

        // Parse input parameters
        const tenant = TenantParser.create(req);

        await Auth.isUserAuthorized(
            req.headers.authorization, TenantAuth.datalakeAdminGroups(tenant),
            tenant.esd, req[Config.DE_FORWARD_APPKEY]);

        // Check if tenant already exists
        Config.disableStrongConsistencyEmulation();
        if (await TenantDAO.exist(tenant)) {
            throw (Error.make(Error.Status.ALREADY_EXISTS,
                'The tenant ' + tenant.name + ' has been registered already'));
        }
        Config.enableStrongConsistencyEmulation();

        // register the tenant metadata
        // leave this registration at the end as last operation (mapping to do only if all previous operation succeed)
        await TenantDAO.register(tenant);

        return tenant;

    }

    // Get the tenant project metadata
    // Required role: tenant.admin
    private static async get(req: expRequest): Promise<TenantModel> {

        // retrieve the tenant information
        const tenant = await TenantDAO.get(req.params.tenantid);

        await Auth.isUserAuthorized(
            req.headers.authorization, TenantAuth.datalakeAdminGroups(tenant),
            tenant.esd, req[Config.DE_FORWARD_APPKEY]);


        return tenant;
    }

    // Delete the tenant project metadata
    // Required role: tenant.admin
    private static async delete(req: expRequest): Promise<void> {

        // retrieve the tenant information
        const tenant = await TenantDAO.get(req.params.tenantid);

        // check if who make the request is a data partition admin admin
        await Auth.isUserAuthorized(
            req.headers.authorization, TenantAuth.datalakeAdminGroups(tenant),
            tenant.esd, req[Config.DE_FORWARD_APPKEY]);


        // retrieve the subprojects list
        const journalClient = JournalFactoryTenantClient.get(tenant);
        const subprojects = await SubProjectDAO.list(journalClient, tenant.name);

        if (!subprojects || subprojects.length > 0) {
            throw (Error.make(Error.Status.BAD_REQUEST,
                'The tenant project \'' + tenant.name + '\' cannot be deleted, ' +
                'it is not empty (contains subprojects).'));
        }

        await TenantDAO.delete(tenant.name);
    }

    // [DEPRECATED]
    // Get tenant path from data partition information
    // Required role: any
    public static async getTenantSDPath(req: expRequest): Promise<string> {

        const dataPartition = TenantParser.dataPartition(req);

        try {
            const tenants = await TenantDAO.getAll();
            if (dataPartition === 'slb') return (Config.SDPATHPREFIX + dataPartition);
            for (const tenant of tenants) {
                if (tenant.esd.startsWith(dataPartition)) {
                    await Auth.isUserRegistered(req.headers.authorization,
                        tenant.esd, req[Config.DE_FORWARD_APPKEY]);
                    return Config.SDPATHPREFIX + tenant.name;
                }
            }
        } catch (error) {
            if ((error as ErrorModel).error.code === Error.Status.BAD_REQUEST) {
                return Config.SDPATHPREFIX + dataPartition;
            } else { throw error; }
        }


    }

}
