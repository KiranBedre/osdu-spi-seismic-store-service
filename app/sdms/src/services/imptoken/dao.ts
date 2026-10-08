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

import { decode as jwtDecode, verify as jwtVerify } from 'jsonwebtoken';
import { ImpTokenModel } from '.';
import { Config, CredentialsFactory } from '../../cloud';
import { Error } from '../../shared';
import { IImpTokenBodyModel as ImpTokenBodyModel, IRefreshUrl } from './model';

import axios, { AxiosError } from 'axios';

export class ImpTokenDAO {

    public static async create(impTokenBody: ImpTokenBodyModel): Promise<ImpTokenModel> {

        const serviceSigner = Config.IMP_SERVICE_ACCOUNT_SIGNER;

        if (!impTokenBody.iat) {
            impTokenBody.iat = Math.floor(Date.now() / 1000);
        }

        const credentials = CredentialsFactory.build(Config.CLOUDPROVIDER);
        const data = {
            payload: JSON.stringify({
                aud: credentials.getAudienceForImpCredentials(),
                email: serviceSigner,
                exp: (impTokenBody.iat + 3600),
                iat: impTokenBody.iat,
                iss: serviceSigner,
                obo: impTokenBody.user,
                rsrc: impTokenBody.resources,
                rurl: impTokenBody.refreshUrl,
                sub: serviceSigner,
            }),
        };
        const headers = {
            headers: {
                'Authorization': 'Bearer ' + (await credentials.getServiceAccountAccessToken()).access_token,
                'Content-Type': 'application/json',
            }
        };

        try {
            const url = credentials.getIAMResourceUrl(serviceSigner);
            const results = await axios.post(url, data, headers);
            const impToken = {} as ImpTokenModel;
            impToken.impersonation_token = JSON.parse(JSON.stringify(results.data.signedJwt));
            impToken.expires_in = 3600;
            impToken.token_type = 'Bearer';
            return impToken;

        } catch (error) {
            throw (Error.makeForHTTPRequest(error));
        }

    }

    public static async canBeRefreshed(refreshUrl: string) {

        const options = { method: 'GET', url: '', headers: {}, data: {} };

        if (refreshUrl.startsWith('https://') || refreshUrl.startsWith('http://')) {
            options.method = 'GET';
            options.headers = {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            };
            options.url = refreshUrl;
        }
        else {
            const refreshUrlOptions = JSON.parse(refreshUrl) as IRefreshUrl;
            options.method = refreshUrlOptions.method;
            options.url = refreshUrlOptions.url;
            if (refreshUrlOptions.headers) options.headers = refreshUrlOptions.headers;
            if (refreshUrlOptions.body) options.data = JSON.stringify(refreshUrlOptions.body);
        }

        try {
            await axios(options);
        } catch (error) {
            // For any code different than 4xx the imptoken can be refreshed
            // This is a temporary fix to handle unavailability of client infrastructure
            if ((error as AxiosError).response.status >= 400 && error.statusCode <= 499) {
                throw (Error.make(Error.Status.BAD_REQUEST, 'The impersonation token cannot be refreshed.'));
            }
        }

    }

    public static async validate(token: string, skipExpireCheck = false): Promise<ImpTokenBodyModel> {

        const credentials = CredentialsFactory.build(Config.CLOUDPROVIDER);
        const options = {
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
            }
        };
        const url = credentials.getPublicKeyCertificatesUrl();

        let result: any;
        result = await axios.get(url, options).catch((error) => {
            throw (Error.makeForHTTPRequest(error));
        });

        let pubkey: string;
        let decodedToken: any;

        try {
            decodedToken = jwtDecode(token, { complete: true });
            if (!decodedToken.header.kid) {
                throw (Error.make(Error.Status.BAD_REQUEST,
                    'The impersonation token is not' +
                    ' a valid seismic store impersonation token. header kid not found'));
            }
            pubkey = result.data[decodedToken.header.kid];
            if (!pubkey) {
                throw (Error.make(Error.Status.BAD_REQUEST,
                    'The impersonation token is not' +
                    ' a valid seismic store impersonation token. pub key not found'));
            }
        } catch (e) {
            throw (Error.make(Error.Status.BAD_REQUEST,
                'The impersonation token is not a valid seismic store impersonation token.'));
        }

        let payload: any;
        try {
            payload = jwtVerify(token, pubkey);
        } catch (error) {
            if (!skipExpireCheck || (error.name && error.name !== 'TokenExpiredError')) {
                throw (Error.make(Error.Status.BAD_REQUEST,
                    'The impersonation token is not a valid seismic store impersonation token.'));
            } else {
                payload = decodedToken.payload;
            }
        }

        if (payload.iss !== Config.IMP_SERVICE_ACCOUNT_SIGNER) {
            throw (Error.make(Error.Status.BAD_REQUEST,
                'The impersonation token is not a valid seismic store impersonation token.'));

        }

        const impTokenBody = {} as ImpTokenBodyModel;
        impTokenBody.iat = undefined;
        impTokenBody.refreshUrl = payload.rurl;
        impTokenBody.user = payload.obo;
        impTokenBody.resources = payload.rsrc;

        if (!impTokenBody.refreshUrl || !impTokenBody.user || !impTokenBody.resources) {
            throw (Error.make(Error.Status.BAD_REQUEST,
                'The impersonation token is not a valid seismic store impersonation token.'));
        }

        return impTokenBody;

    }

    public static getImpTokenBody(impToken: string): ImpTokenBodyModel {

        const payload = JSON.parse(Buffer.from(
            impToken.replace('Bearer', '').replace(/\s/g, '').split('.')[1], 'base64').toString());

        return {
            iat: payload.iat,
            refreshUrl: payload.rurl,
            resources: payload.rsrc,
            user: payload.obo,
        } as ImpTokenBodyModel;

    }

}
