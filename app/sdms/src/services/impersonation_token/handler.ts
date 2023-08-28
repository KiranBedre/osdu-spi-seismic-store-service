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

import { Request as expRequest, Response as expResponse } from 'express';
import { Auth, AuthProviderFactory, AuthRoles } from '../../auth';
import { Config, JournalFactoryTenantClient } from '../../cloud';
import { SeistoreFactory } from '../../cloud/seistore';
import { Error, Feature, FeatureFlags, Response, Utils, getInMemoryCacheInstance, cacheShared } from '../../shared';
import { SubprojectAuth, SubProjectDAO } from '../subproject';
import { TenantDAO } from '../tenant';
import { ImpersonationTokenContextModel, ImpersonationTokenModel } from './model';
import { ImpersonationTokenOps } from './optype';
import { ImpersonationTokenParser } from './parser';

export class ImpersonationTokenHandler {

    private static cacheKey = 'sdms-auth-token';

    // handler for the [ /impersonation-token ] endpoints
    public static async handler(req: expRequest, res: expResponse, op: ImpersonationTokenOps) {

        try {

            // the impersonation token endpoints are not available with impersonation tokens
            if (Auth.isImpersonationToken(req.headers.authorization)) {
                throw (Error.make(Error.Status.PERMISSION_DENIED,
                    'Impersonation token endpoints not available' +
                    ' with an impersonation token as Auth credentials.'));
            }

            if (op === ImpersonationTokenOps.Generate) {
                Response.writeOK(res, await this.generate(req));
            } else if (op === ImpersonationTokenOps.Refresh) {
                Response.writeOK(res, await this.refresh(req));
            } else { throw (Error.make(Error.Status.UNKNOWN, 'Internal Server Error')); }
        } catch (error) { Response.writeError(res, error); }

    }

    // Generate an impersonation token
    // Required role: app.trusted
    private static async generate(req: expRequest): Promise<ImpersonationTokenModel> {

        if (!FeatureFlags.isEnabled(Feature.IMPTOKEN)) return {} as ImpersonationTokenModel;

        const requestBody = await ImpersonationTokenParser.generate(req);
        const tenantName = requestBody.resources[0].resource.split('/')[0];
        const tenant = await TenantDAO.get(tenantName);
        const subject = Utils.getSubFromPayload(req.headers.authorization);
        const user = await Utils.getUserId(
            req.headers['user-token'] as string);

        // check if the caller is a trusted application (subject, email(obsolete), emailV2(obsolete))
        try {
            await Auth.isAppAuthorized(tenant, subject);
        } catch (error) {
            const appEmail = await SeistoreFactory.build(
                Config.CLOUDPROVIDER).getEmailFromTokenPayload(req.headers.authorization, false);
            try {
                await Auth.isAppAuthorized(tenant, appEmail);
            } catch (error) {
                const appEmailV2 = Utils.checkSauthV1EmailDomainName(appEmail);
                if (appEmailV2 !== appEmail) {
                    await Auth.isAppAuthorized(tenant, appEmailV2);
                } else {
                    throw (error);
                }
            }
        }

        // init journalClient client
        const journalClient = JournalFactoryTenantClient.get(tenant);

        // check if the user is authorized on access the requested resource
        const authorizationCheckList = [];
        for (const item of requestBody.resources) {

            // retrieve the destination subproject info (resource is tenantName[0]/subprojectName[1])
            const subproject = await SubProjectDAO.get(journalClient, tenant.name, item.resource.split('/')[1]);

            if (item.readonly) {
                authorizationCheckList.push(
                    Auth.isReadAuthorized(
                        requestBody.userToken.startsWith('Bearer') ?
                            requestBody.userToken :
                            'Bearer ' + requestBody.userToken,
                        SubprojectAuth.getAuthGroups(subproject, AuthRoles.viewer),
                        tenant, subproject.name, req[Config.DE_FORWARD_APPKEY],
                        req.headers['impersonation-token-context'] as string, false));
            } else {
                authorizationCheckList.push(
                    Auth.isWriteAuthorized(
                        requestBody.userToken.startsWith('Bearer') ?
                            requestBody.userToken :
                            'Bearer ' + requestBody.userToken,
                        SubprojectAuth.getAuthGroups(subproject, AuthRoles.admin),
                        tenant, subproject.name, req[Config.DE_FORWARD_APPKEY],
                        req.headers['impersonation-token-context'] as string, false));
            }
        }

        const results = await Promise.all(authorizationCheckList);
        const index = results.indexOf(false); // error if find at least one not unauthorized
        if (results.indexOf(false) !== -1) {
            throw (Error.make(Error.Status.PERMISSION_DENIED,
                'User is not ' + (requestBody.resources[index].readonly ? 'read' : 'write')
                + ' authorized in the ' + Config.SDPATHPREFIX +
                requestBody.resources[index].resource + ' subproject resource.'));
        }

        const impersonationToken = await this.getImpersonationToken();
        const impersonatedBy = await Utils.getUserId(
            req.headers.authorization);

        // Build and sign the impersonation token context
        const context = {
            user,
            metadata: requestBody.metadata,
            resources: requestBody.resources,
            impersonated_by: impersonatedBy,
        } as ImpersonationTokenContextModel;

        const authClientSecret = AuthProviderFactory.build(
            Config.SERVICE_AUTH_PROVIDER).getClientSecret();

        const encryptedContext = Utils.encrypt(JSON.stringify(context), authClientSecret);
        impersonationToken.context = encryptedContext.encryptedText + '.' + encryptedContext.encryptedTextIV;

        return impersonationToken;
    }

    // Refresh the impersonation token
    // Required role: app.trusted
    private static async refresh(req: expRequest): Promise<ImpersonationTokenModel> {

        if (!FeatureFlags.isEnabled(Feature.IMPTOKEN)) return {} as ImpersonationTokenModel;

        // parse the request input and retrieve the token.
        const requestParams = ImpersonationTokenParser.refresh(req);

        const authClientSecret = AuthProviderFactory.build(
            Config.SERVICE_AUTH_PROVIDER).getClientSecret();

        // decrypt the impersonation token context
        const context = JSON.parse(Utils.decrypt(
            requestParams.tokenContext.split('.')[0],
            requestParams.tokenContext.split('.')[1],
            authClientSecret)) as ImpersonationTokenContextModel;

        const tenantName = context.resources[0].resource.split('/')[0];
        const tenant = await TenantDAO.get(tenantName);
        const subject = Utils.getSubFromPayload(req.headers.authorization);

        // check if the caller is a trusted application (subject, email(obsolete), emailV2(obsolete))
        try {
            await Auth.isAppAuthorized(tenant, subject);
        } catch (error) {
            const appEmail = Utils.getPropertyFromTokenPayload(req.headers.authorization,
                Config.USER_ID_CLAIM_FOR_ENTITLEMENTS_SVC);
            try {
                await Auth.isAppAuthorized(tenant, appEmail);
            } catch (error) {
                const appEmailV2 = Utils.checkSauthV1EmailDomainName(appEmail);
                if (appEmailV2 !== appEmail) {
                    await Auth.isAppAuthorized(tenant, appEmailV2);
                } else {
                    throw (error);
                }
            }
        }

        const impersonationToken = await this.getImpersonationToken();
        impersonationToken.context = requestParams.tokenContext;
        return impersonationToken;
    }

    private static async getImpersonationToken(): Promise<ImpersonationTokenModel>{
        // check both local and shared cache for impersonation token
        let expireIn = 0;
        const inMemoryCache = getInMemoryCacheInstance();
        let impersonationToken = inMemoryCache.get<ImpersonationTokenModel>(this.cacheKey);
        if (!impersonationToken) {
            impersonationToken = (await cacheShared.get(this.cacheKey)) as ImpersonationTokenModel;
            if (!impersonationToken) {
                // generate the impersonation token credential token (the auth credential)
                const authProvider = AuthProviderFactory.build(Config.SERVICE_AUTH_PROVIDER);
                const scopes = [authProvider.getClientID()];
                if (Config.DES_TARGET_AUDIENCE) {
                    scopes.push(Config.DES_TARGET_AUDIENCE);
                }
                impersonationToken = authProvider.convertToImpersonationTokenModel(
                    await authProvider.generateScopedAuthCredential(scopes));

                expireIn = this.getTokenExpireInSec(impersonationToken.impersonation_token);
                const cacheTTL = expireIn - Config.IMPERSONATION_TOKEN_CACHE_EXPIRE_MARGIN;
                if(cacheTTL < 0) {
                    throw Error.make(Error.Status.UNKNOWN,
                        'An error occurred while generating the auth credential. ' +
                        'The credential expiration time is ' + expireIn + ' seconds. ' +
                        'The minimum acceptable expiration time by the service is ' +
                        Config.IMPERSONATION_TOKEN_CACHE_EXPIRE_MARGIN + ' seconds.');
                }
                await cacheShared.set(this.cacheKey, impersonationToken, cacheTTL);
                inMemoryCache.set<ImpersonationTokenModel>(
                    this.cacheKey, impersonationToken, cacheTTL);
            }
            else {
                const ttlInShared = await cacheShared.getTTL(this.cacheKey);
                inMemoryCache.set<ImpersonationTokenModel>(this.cacheKey, impersonationToken, ttlInShared);
            }
        }
        // recompute the expiration time
        impersonationToken.expires_in = expireIn || this.getTokenExpireInSec(impersonationToken.impersonation_token);
        return impersonationToken;
    }

    public static decodeContext(tokenContext: string): ImpersonationTokenContextModel {
        const authClientSecret = AuthProviderFactory.build(
            Config.SERVICE_AUTH_PROVIDER).getClientSecret();

        // decrypt the impersonation token context
        return JSON.parse(Utils.decrypt(
            tokenContext.split('.')[0],
            tokenContext.split('.')[1],
            authClientSecret)) as ImpersonationTokenContextModel;
    }

    private static getTokenExpireInSec(token: string) {
        return Math.floor(Utils.getExpTimeFromPayload(token) - Date.now()/1000);
    }

}
