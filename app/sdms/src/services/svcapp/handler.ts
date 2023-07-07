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

import { Auth } from '../../auth';
import { Config } from '../../cloud';
import { Error, Response, Utils } from '../../shared';
import { TenantAuth, TenantDAO } from '../tenant';
import { AppsDAO } from './dao';
import { IAppModel } from './model';
import { AppOp } from './optype';
import { AppParser } from './parser';

export class AppHandler {

    // handler for the [ /app ] endpoints
    public static async handler(req: expRequest, res: expResponse, op: AppOp) {

        try {
            // subproject endpoints are not available with impersonation token
            if (Auth.isImpersonationToken(req.headers.authorization)) {
                throw (Error.make(Error.Status.PERMISSION_DENIED,
                    'app endpoints not available' +
                    ' with an impersonation token as Auth credentials.'));
            }

            if (op === AppOp.Register) {
                Response.writeOK(res, await this.registerApp(req));
            } else if (op === AppOp.RegisterTrusted) {
                Response.writeOK(res, await this.registerAppTrusted(req));
            } else if (op === AppOp.List) {
                Response.writeOK(res, await this.listApps(req));
            } else if (op === AppOp.ListTrusted) {
                Response.writeOK(res, await this.listAppsTrusted(req));
            } else { throw (Error.make(Error.Status.UNKNOWN, 'Internal Server Error')); }

        } catch (error) { Response.writeError(res, error); }

    }

    // register an application in a seismic store tenant
    private static async registerApp(req: expRequest): Promise<void> {

        // parse user request
        const userInput = AppParser.register(req);
        const application: IAppModel = { email: userInput.email, trusted: false };

        // This method is temporary required by slb during the migration of sauth from v1 to v2
        // The method replace slb.com domain name with delfiserviceaccount.com
        // Temporary hardcoded can be removed on 01/22 when sauth v1 will be dismissed.
        // Others service domain won't be affected by this call
        application.email = Utils.checkSauthV1EmailDomainName(application.email);

        // retrieve the tenant information
        const tenant = await TenantDAO.get(userInput.sdPath.tenant);

        // check if user is a tenant admin
        await Auth.isUserAuthorized(
            req.headers.authorization, TenantAuth.getAuthGroups(tenant),
            tenant.esd, req[Config.DE_FORWARD_APPKEY]);

        // check if application already exists
        if (await AppsDAO.get(tenant, application.email)) { return; }

        // register the application
        await AppsDAO.register(tenant, application);

    }

    // Register an application in a seismic store tenant as trusted (it must be previously registered)
    // Required role: tenant.admin
    private static async registerAppTrusted(req: expRequest) {

        // parse user request
        const userInput = AppParser.register(req);
        const application: IAppModel = { email: userInput.email, trusted: true };

        // This method is temporary required by slb during the migration of sauth from v1 to v2
        // The method replace slb.com domain name with delfiserviceaccount.com
        // Temporary hardcoded can be removed on 01/22 when sauth v1 will be dismissed.
        // Others service domain won't be affected by this call
        application.email = Utils.checkSauthV1EmailDomainName(application.email);

        // retrieve the tenant information
        const tenant = await TenantDAO.get(userInput.sdPath.tenant);

        // check if user is a tenant admin
        await Auth.isUserAuthorized(
            req.headers.authorization, TenantAuth.getAuthGroups(tenant),
            tenant.esd, req[Config.DE_FORWARD_APPKEY]);

        // check if the app has been previously registered
        if (!await AppsDAO.get(tenant, application.email)) {
            throw (Error.make(Error.Status.BAD_REQUEST,
                'The application has not been previously registered as app in ' + 'sd://' + tenant.name));
        }

        // mark the application as trusted
        await AppsDAO.register(tenant, application);

    }

    // List register application in a seismic store tenant
    // Required role: tenant.admin
    private static async listApps(req: expRequest): Promise<string[]> {

        // parse user request
        const sdPath = AppParser.list(req);

        // retrieve the tenant information
        const tenant = await TenantDAO.get(sdPath.tenant);

        // check if user is a tenant admin
        await Auth.isUserAuthorized(
            req.headers.authorization, TenantAuth.getAuthGroups(tenant),
            tenant.esd, req[Config.DE_FORWARD_APPKEY]);


        // retrieve entity list
        // This method is temporary required by slb during the migration of sauth from v1 to v2
        // The method replace slb.com domain name with delfiserviceaccount.com
        // Temporary hardcoded can be replaced with the below line on 01/22 when sauth v1 will be dismissed.
        //    return (await AppsDAO.list(tenant)).map((e) => e.email);
        // Others service domain won't be affected by this check
        return (await AppsDAO.list(tenant)).map((e) => Utils.checkSauthV1EmailDomainName(e.email));
    }

    // List trusted application in a seismic store tenant
    // Required role: tenant.admin
    private static async listAppsTrusted(req: expRequest) {

        // parse user request
        const sdPath = AppParser.list(req);

        // retrieve the tenant information
        const tenant = await TenantDAO.get(sdPath.tenant);

        // check if user is a tenant admin
        await Auth.isUserAuthorized(
            req.headers.authorization, TenantAuth.getAuthGroups(tenant),
            tenant.esd, req[Config.DE_FORWARD_APPKEY]);

        // retrieve entity list
        // This method is temporary required by slb during the migration of sauth from v1 to v2
        // The method replace slb.com domain name with delfiserviceaccount.com
        // Temporary hardcoded can be replaced with the below line on 01/22 when sauth v1 will be dismissed.
        //    return (await AppsDAO.list(tenant)).filter((e) => e.trusted).map((e) => e.email);
        // Others service domain won't be affected by this check
        return (await AppsDAO.list(tenant)).filter(
            (e) => e.trusted).map((e) => Utils.checkSauthV1EmailDomainName(e.email));

    }

}
