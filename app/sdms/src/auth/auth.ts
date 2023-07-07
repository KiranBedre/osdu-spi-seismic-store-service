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

import { createHash } from 'crypto';
import { Config } from '../cloud';
import { LoggerFactory } from '../cloud';
import { DESCompliance, DESUtils } from '../dataecosystem';
import { ImpersonationTokenContextModel, ImpersonationTokenModel } from '../services/impersonation_token/model';
import { ImpTokenDAO } from '../services/imptoken';
import { AppsDAO } from '../services/svcapp/dao';
import { TenantModel } from '../services/tenant';
import { ITenantModel } from '../services/tenant/model';
import { Error, getInMemoryCacheInstance, Utils } from '../shared';
import { AuthGroups } from './groups';

// ===============================================================================================
// This class is used to register all auth provider
// ===============================================================================================
export class AuthProviderFactoryBuilder {

    public static register(providerLabel: string) {
        return (target: any) => {
            if (AuthProviderFactoryBuilder.providers[providerLabel]) {
                AuthProviderFactoryBuilder.providers[providerLabel].push(target);
            } else {
                AuthProviderFactoryBuilder.providers[providerLabel] = [target];
            }
            return target;
        };
    }

    public static build(providerLabel: string, referenceAbstraction: any, args: { [key: string]: any; } = {}) {
        if (providerLabel === undefined || providerLabel === 'unknown') {
            throw (Error.make(Error.Status.UNKNOWN,
                `Unrecognized auth provider: ${providerLabel}`));
        }
        for (const provider of AuthProviderFactoryBuilder.providers[providerLabel]) {
            if (provider.prototype instanceof referenceAbstraction) {
                return new provider(args);
            }
        }
        throw (Error.make(Error.Status.UNKNOWN,
            `The auth provider builder that extend ${referenceAbstraction} has not been found`));
    }

    private static providers: { [key: string]: any[]; } = {};

}

// ===============================================================================================
// These are the service auth provider methods used for example to generate an impersonation token
// ===============================================================================================
export interface IAuthProvider {
    generateAuthCredential(): Promise<any>;
    generateScopedAuthCredential(scopes: string[]): Promise<any>;
    convertToImpersonationTokenModel(credential: any): ImpersonationTokenModel;
    getClientID(): string;
    getClientSecret(): string;
    exchangeCredentialAudience(credential: string, audience: string): Promise<string>;
}

export abstract class AbstractAuthProvider implements IAuthProvider {
    public abstract generateAuthCredential(): Promise<any>;
    public abstract generateScopedAuthCredential(scopes: string[]): Promise<any>;
    public abstract convertToImpersonationTokenModel(credential: any): ImpersonationTokenModel;
    public abstract getClientID(): string;
    public abstract getClientSecret(): string;
    public abstract exchangeCredentialAudience(credential: string, audience: string): Promise<string>;
}

export class AuthProviderFactory extends AuthProviderFactoryBuilder {
    public static build(providerLabel: string): AbstractAuthProvider {
        return AuthProviderFactoryBuilder.build(providerLabel, AbstractAuthProvider) as IAuthProvider;
    }
}

// ===============================================================================================
// Generic Auth provider class to manage Authorizations in SDMS
// ===============================================================================================
export class Auth {

    public static async isUserRegistered(userToken: string, esd: string, appkey: string) {
        await AuthGroups.getUserGroups(userToken, esd, appkey);
    }

    public static async isUserAuthorized(
        authToken: string, authGroupEmails: string[],
        esd: string, appkey: string, mustThrow = true): Promise<boolean> {

        const cacheKey = 'auth-' + (
            createHash('sha1').update(authToken).digest('base64') + ',' + authGroupEmails.sort().join(','));

        const cache = getInMemoryCacheInstance();
        let isAuthorized = cache.get<boolean>(cacheKey);
        if (isAuthorized === undefined) { // key not exist in cache -> call entitlement
            isAuthorized = await AuthGroups.isMemberOfAtLeastOneGroup(authToken, authGroupEmails, esd, appkey);
            cache.set<boolean>(cacheKey, isAuthorized, 60);
        }

        if (mustThrow && !isAuthorized) {
            throw (Error.make(Error.Status.PERMISSION_DENIED,
                'User not authorized to perform this operation'));
        }

        return isAuthorized;
    }

    public static async isWriteAuthorized(
        authToken: string, authGroupsName: string[],
        tenant: ITenantModel, subprojectName: string,
        appkey: string, impersonationTokenContext: string,
        mustThrow: boolean = true): Promise<boolean> {

        // TODO: Think about this
        // 1. Do we really need IMP tokens
        // 2. If we do need, why do we need to check the issuer?
        //
        if (Config.USER_ID_FROM_PROVIDER_API) {
            return await Auth.isUserAuthorized(authToken, authGroupsName, tenant.esd, appkey, mustThrow);
        }
        else if (Auth.isObsoleteImpersonationToken(authToken)) {
            return Auth.isImpersonationTokenWriteAuthorized(authToken,
                tenant.name, subprojectName, mustThrow);
        } else if (Auth.isNewImpersonationToken(authToken)) {
            /* FIXME: This is a workaround to use impersonation tokens without having to provide the context.
            Should remove this "mustThrow" code change once impersonation-Token-Context is properly enforced
            */
            mustThrow = false;

            return await Auth.isNewImpersonationTokenWriteAuthorized(
                impersonationTokenContext, tenant, subprojectName, mustThrow);
        } else {
            return await Auth.isUserAuthorized(authToken, authGroupsName, tenant.esd, appkey, mustThrow);
        }
    }

    public static async isReadAuthorized(
        authToken: string, authGroupsName: string[],
        tenant: ITenantModel, subprojectName: string,
        appkey: string, impersonationTokenContext: string,
        mustThrow: boolean = true): Promise<boolean> {

        // TODO: Think about this
        // 1. Do we really need IMP tokens
        // 2. If we do need, why do we need to check the issuer?
        // 3. What does the impersonation means for us at all?
        //
        if (Config.USER_ID_FROM_PROVIDER_API) {
            return await Auth.isUserAuthorized(authToken, authGroupsName, tenant.esd, appkey, mustThrow);
        }
        else if (Auth.isObsoleteImpersonationToken(authToken)) {
            return Auth.isImpersonationTokenReadAuthorized(authToken,
                tenant.name, subprojectName, mustThrow);
        } else if (Auth.isNewImpersonationToken(authToken)) {
            return Auth.isNewImpersonationTokenReadAuthorized(
                impersonationTokenContext, tenant, subprojectName, mustThrow);
        } else {
            return await Auth.isUserAuthorized(authToken, authGroupsName, tenant.esd, appkey, mustThrow);
        }
    }

    public static async isAppAuthorized(
        tenant: TenantModel, email: string, mustThrow: boolean = true): Promise<boolean> {
        const application = await AppsDAO.get(tenant, email);
        if (mustThrow && (!application || !application.trusted)) {
            throw (Error.make(
                Error.Status.PERMISSION_DENIED,
                'Application not authorized to perform this operation'));
        }
        return application ? application.trusted : false;
    }

    public static async isLegalTagValid(
        userToken: string, ltag: string, esd: string, appkey: string, mustThrow: boolean = true): Promise<boolean> {
        const entitlementTenant = DESUtils.getDataPartitionID(esd);
        const isValid = await DESCompliance.isLegalTagValid(userToken, ltag, entitlementTenant, appkey);
        if (mustThrow && !isValid) {
            throw (Error.make(
                Error.Status.NOT_FOUND, 'The legal tag \'' + ltag + '\' is not valid.'));
        }
        return isValid;
    }

    public static isImpersonationToken(authToken: string): boolean {
        return this.isObsoleteImpersonationToken(authToken) || this.isNewImpersonationToken(authToken);
    }

    private static isObsoleteImpersonationToken(authToken: string): boolean {
        return Utils.getIssFromPayload(authToken.split('.')[1]) === Config.IMP_SERVICE_ACCOUNT_SIGNER;
    }

    public static isNewImpersonationToken(authToken: string): boolean {
        return Config.SERVICE_AUTH_PROVIDER !== 'generic' ?
            Utils.getSubFromPayload(authToken) === AuthProviderFactory.build(
                Config.SERVICE_AUTH_PROVIDER).getClientID() : false;
    }

    private static isImpersonationTokenWriteAuthorized(
        impToken: string, tenantName: string, subprojectName: string, mustThrow: boolean = true): boolean {
        const impTokenBody = ImpTokenDAO.getImpTokenBody(impToken);
        const resourceRef = tenantName + '/' + subprojectName;
        const resource = impTokenBody.resources.find((el) => el.resource === resourceRef);

        if (!resource && mustThrow) {
            throw (Error.make(Error.Status.PERMISSION_DENIED,
                'The imptoken has not been authorized for the subproject resource ' +
                'sd://' + tenantName + '/' + subprojectName));
        }
        if (!resource) { return false; }

        if (resource.readonly && mustThrow) {
            throw (Error.make(Error.Status.PERMISSION_DENIED,
                'The imptoken has not been write authorized for the subproject resource ' +
                'sd://' + tenantName + '/' + subprojectName));
        }
        return !resource.readonly;
    }

    private static isImpersonationTokenReadAuthorized(
        impToken: string, tenantName: string, subprojectName: string, mustThrow: boolean = true): boolean {
        const impTokenBody = ImpTokenDAO.getImpTokenBody(impToken);
        const resourceRef = tenantName + '/' + subprojectName;
        const resource = impTokenBody.resources.find((el) => el.resource === resourceRef);

        if (!resource && mustThrow) {
            throw (Error.make(Error.Status.PERMISSION_DENIED,
                'The imptoken has not been authorized for the subproject resource ' +
                'sd://' + tenantName + '/' + subprojectName));
        }
        return resource !== undefined;
    }

    private static async isNewImpersonationTokenWriteAuthorized(
        tokenContext: string, tenant: ITenantModel,
        subprojectName: string, mustThrow = true): Promise<boolean> {

        if (!tokenContext) {
            if (!mustThrow) { return false; }
            throw (Error.make(Error.Status.BAD_REQUEST,
                'Unauthorized Access to ' + 'sd://' + tenant.name + '/' + subprojectName +
                'The request impersonation-token-context header has not been specified.'));
        }

        if (tokenContext.split('.').length !== 2) {
            if (!mustThrow) { return false; }
            throw (Error.make(Error.Status.BAD_REQUEST,
                'Unauthorized Access to ' + 'sd://' + tenant.name + '/' + subprojectName +
                'The request impersonation-token-context header value is not in the right form.'));
        }

        const authClientSecret = AuthProviderFactory.build(
            Config.SERVICE_AUTH_PROVIDER).getClientSecret();

        // decrypt the impersonation token context
        const context = JSON.parse(Utils.decrypt(
            tokenContext.split('.')[0],
            tokenContext.split('.')[1],
            authClientSecret)) as ImpersonationTokenContextModel;

        const resource = context.resources.find((el) => el.resource === (tenant.name + '/' + subprojectName));

        // resource not found
        if (!resource) {
            if (!mustThrow) { return false; }
            throw (Error.make(Error.Status.PERMISSION_DENIED,
                'The impersonation token has not been authorized for the subproject resource ' +
                'sd://' + tenant.name + '/' + subprojectName));
        }

        if (resource.readonly) {
            if (!mustThrow) { return false; }
            throw (Error.make(Error.Status.PERMISSION_DENIED,
                'The impersonation token has not been write authorized for the subproject resource ' +
                'sd://' + tenant.name + '/' + subprojectName));
        }

        return true;

    }

    private static async isNewImpersonationTokenReadAuthorized(
        tokenContext: string, tenant: ITenantModel,
        subprojectName: string, mustThrow: boolean = true): Promise<boolean> {

        if (!tokenContext) {
            if (!mustThrow) { return false; }
            throw (Error.make(Error.Status.BAD_REQUEST,
                'Unauthorized Access to ' + 'sd://' + tenant.name + '/' + subprojectName +
                'The request impersonation-token-context header has not been specified.'));
        }

        if (tokenContext.split('.').length !== 2) {
            if (!mustThrow) { return false; }
            throw (Error.make(Error.Status.BAD_REQUEST,
                'Unauthorized Access to ' + 'sd://' + tenant.name + '/' + subprojectName +
                'The request impersonation-token-context header value is not in the right form.'));
        }

        const authClientSecret = AuthProviderFactory.build(
            Config.SERVICE_AUTH_PROVIDER).getClientSecret();

        // decrypt the impersonation token context
        const context = JSON.parse(Utils.decrypt(
            tokenContext.split('.')[0],
            tokenContext.split('.')[1],
            authClientSecret)) as ImpersonationTokenContextModel;

        const resource = context.resources.find((el) => el.resource === (tenant.name + '/' + subprojectName));

        // resource not found
        if (!resource) {
            if (!mustThrow) { return false; }
            throw (Error.make(Error.Status.PERMISSION_DENIED,
                'The impersonation token has not been authorized for the subproject resource ' +
                'sd://' + tenant.name + '/' + subprojectName));
        }

        return true;

    }

}
