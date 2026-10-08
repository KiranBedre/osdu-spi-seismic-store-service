// ============================================================================
// Copyright 2017-2019, Schlumberger
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

import { Request as expRequest } from 'express';
import { Config } from '../../cloud';
import { SeistoreFactory } from '../../cloud/seistore';
import { Error, Params, SDPath, Utils } from '../../shared';
import { IImpTokenBodyModel as ImpTokenBodyModel, IResourceModel as ResourceModel } from './model';

export class ImpTokenParser {

    private static checkRefreshUrl(refreshUrl: any) {

        if (refreshUrl.startsWith('https://') || refreshUrl.startsWith('http://')) return;
        try {
            refreshUrl = JSON.parse(refreshUrl);
            // method/url mandatory as string headers/body optional but if presents as objects
            if (!(refreshUrl.method && typeof (refreshUrl.method) === 'string'))
                throw undefined;
            if (!(refreshUrl.url && typeof (refreshUrl.url) === 'string'))
                throw undefined;
            if (!(!refreshUrl.headers || (refreshUrl.headers && typeof (refreshUrl.headers) === 'object')))
                throw undefined;
            if (!(!refreshUrl.body || (refreshUrl.body && typeof (refreshUrl.body) === 'object')))
                throw undefined;
        } catch {
            throw (Error.make(Error.Status.BAD_REQUEST, 'The \'refresh-url\' format is not valid.'));
        }

    }

    public static async create(req: expRequest): Promise<ImpTokenBodyModel> {

        Params.checkBody(req.body);

        const impToken = {} as ImpTokenBodyModel;
        impToken.refreshUrl = req.body['refresh-url'];
        impToken.userToken = req.body.token;
        impToken.resources = req.body.resources;

        // Refresh Url
        Params.checkString(impToken.refreshUrl, 'refresh-url');
        this.checkRefreshUrl(impToken.refreshUrl);

        // User Token & User
        Params.checkString(impToken.userToken, 'token');

        impToken.userToken = impToken.userToken.replace('Bearer', '').replace(/\s/g, '');
        const exp = Utils.getExpTimeFromPayload(impToken.userToken);
        if (exp < Math.floor(Date.now() / 1000)) {
            throw (Error.make(Error.Status.BAD_REQUEST, 'The \'token\' specified in the token body field expired.'));
        }

        impToken.user = Utils.getPropertyFromTokenPayload(impToken.userToken, 'desid') ||
            (await SeistoreFactory.build(
                Config.CLOUDPROVIDER).getEmailFromTokenPayload(req.headers.authorization, true));

        impToken.userToken = 'Bearer ' + impToken.userToken;

        // Resources
        Params.checkArray(impToken.resources, 'resources');
        if (impToken.resources.length === 0) {
            throw (Error.make(Error.Status.BAD_REQUEST, 'The \'resources\' body field is empty.'));
        }

        const resourcesMap = new Map<string, ResourceModel>();
        let tenantRef: string;
        for (const item of impToken.resources) {

            Params.checkObject(item, 'resource');
            Params.checkString(item.resource, 'resource path');
            Params.checkBoolean(item.readonly, 'resource path', false);

            const sdpath = SDPath.getFromString(item.resource);
            if (!sdpath || !sdpath.subproject) {
                throw (Error.make(Error.Status.BAD_REQUEST, 'The resource ' + item.resource +
                    ' is not valid seismic store subproject resource path'));
            }

            tenantRef = tenantRef || sdpath.tenant;
            if (tenantRef !== sdpath.tenant) {
                throw (Error.make(Error.Status.BAD_REQUEST, 'The resources cannot have different tenants project'));
            }

            const subprojectPath = sdpath.tenant + '/' + sdpath.subproject;
            let readonly = (item.readonly === undefined) ? true : item.readonly;
            const cached = resourcesMap.get(subprojectPath);
            readonly = (cached === undefined) ? readonly : (cached.readonly && readonly);
            resourcesMap.set(subprojectPath, { resource: subprojectPath, readonly });
        }
        impToken.resources = Array.from(resourcesMap.values());

        // Issued At Time
        impToken.iat = Math.floor(Date.now() / 1000);

        return impToken;

    }

    public static refresh(req: expRequest): string {

        Params.checkBody(req.body);

        Params.checkString(req.body.token, 'token');

        const refreshToken = req.body.token.replace('Bearer', '').replace(/\s/g, '');

        if ((refreshToken.match(/\./g) || []).length !== 2) {
            throw (Error.make(Error.Status.BAD_REQUEST,
                'The token body field is not a valid seismic store impersonation token'));
        }

        const refreshTokenPayload = JSON.parse(Buffer.from(refreshToken.split('.')[1], 'base64').toString());
        if (refreshTokenPayload.iss !== Config.IMP_SERVICE_ACCOUNT_SIGNER) {
            throw (Error.make(Error.Status.BAD_REQUEST,
                'The token body field is not a valid seismic store impersonation token'));
        }
        if (!('rurl' in refreshTokenPayload) || !('obo' in refreshTokenPayload) || !('rsrc' in refreshTokenPayload)) {
            throw (Error.make(Error.Status.BAD_REQUEST,
                'The token body field is not a valid seismic store impersonation token'));
        }

        return refreshToken;

    }

    public static patch(req: expRequest): { tokenToPatch: string, refreshUrl: string } {

        Params.checkBody(req.body);
        Params.checkString(req.body.token, 'token');
        Params.checkString(req.body['refresh-url'], 'token');
        this.checkRefreshUrl(req.body['refresh-url']);

        const tokenToPatch = req.body.token.replace('Bearer', '').replace(/\s/g, '');
        const tokenToPatchPayload = JSON.parse(Buffer.from(tokenToPatch.split('.')[1], 'base64').toString());
        if (tokenToPatchPayload.iss !== Config.IMP_SERVICE_ACCOUNT_SIGNER) {
            throw (Error.make(Error.Status.BAD_REQUEST,
                'The token body field is not a valid seismic store impersonation token'));
        }

        if (!('rurl' in tokenToPatchPayload) || !('obo' in tokenToPatchPayload) || !('rsrc' in tokenToPatchPayload)) {
            throw (Error.make(Error.Status.BAD_REQUEST,
                'The token body field is not a valid seismic store impersonation token'));
        }

        const refreshUrl = req.body['refresh-url'];
        return { tokenToPatch, refreshUrl };

    }

}
