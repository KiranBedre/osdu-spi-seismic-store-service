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

import jwttoken from 'jsonwebtoken';
import axios from 'axios';
import qs from 'qs';
import { Config } from '../../../cloud';
import { Error, Utils } from '../../../shared';
import { AbstractCredentials, CredentialsFactory, IAccessTokenModel } from '../../credentials';
import { ConfigGoogle } from './config';


interface IDTokenModel {
    id_token: string;
}

interface IDownScopedToken {
    access_token: string;
    token_type: string;
    issued_token_type: string;
    expires_in: string;
}

const KExpiresMargin = 300; // 5 minutes

@CredentialsFactory.register('google')
export class Credentials extends AbstractCredentials {

    public async getStorageCredentials(
        tenant: string, subproject: string,
        bucket: string, readonly: boolean, _partition: string, objectPrefix?: string): Promise<IAccessTokenModel> {

        const serviceAccessToken = await this.getServiceAccountAccessToken(false);
        const serviceAccessTokenDownscoped = await this.exchangeJwtWithDownScopedAccessToken(
            serviceAccessToken.access_token, bucket, readonly, objectPrefix);

        return {
            access_token: serviceAccessTokenDownscoped.access_token,
            expires_in: +serviceAccessTokenDownscoped.expires_in,
            token_type: serviceAccessTokenDownscoped.token_type,
        };
    }

    private async exchangeJwtWithDownScopedAccessToken(accessToken: string,
        bucket: string, readonly: boolean, objectPrefix?: string): Promise<IDownScopedToken> {
        try {

            const accessBoundary = {
                'accessBoundaryRules': [
                    {
                        'availableResource': '//storage.googleapis.com/projects/_/buckets/' + bucket,
                        'availablePermissions': [
                            'inRole:roles/' + (readonly ? 'storage.objectViewer' : 'storage.objectAdmin')
                        ],
                    }
                ]
            };

            if (objectPrefix) {
                accessBoundary.accessBoundaryRules[0]['availabilityCondition'] = {
                    'title': 'obj-prefixes',
                    'expression':
                        'resource.name.startsWith(\"projects/_/buckets/' +
                            bucket + '/objects/' + objectPrefix + '\")' +
                        ' || ' +
                        'api.getAttribute(\"storage.googleapis.com/objectListPrefix\", \"\").startsWith(\"' +
                            objectPrefix + '\")'
                };
            }

            const data = qs.stringify({
                grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
                subject_token_type: 'urn:ietf:params:oauth:token-type:access_token',
                requested_token_type: 'urn:ietf:params:oauth:token-type:access_token',
                subject_token: accessToken,
                options: JSON.stringify({
                    'accessBoundary': accessBoundary
                })
            });
            const headers = {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                }
            };
            const url = 'https://sts.googleapis.com/v1beta/token';

            const results = await axios.post(url, data, headers);

            return results.data;

        } catch (error) {
            throw (Error.makeForHTTPRequest(error));
        }
    }

    public async getServiceCredentials(): Promise<string> {

        const now = Math.floor(Date.now() / 1000);
        if (Credentials.serviceAccountIdTokenExpiresIn > now) {
            return Credentials.serviceAccountIdToken;
        }

        Credentials.serviceAccountEmail = await this.getServiceAccountEmail();

        try {

            const signedToken = (await axios.request({
                url: ConfigGoogle.GOOGLE_EP_IAM + '/projects/' +
                    ConfigGoogle.SERVICE_CLOUD_PROJECT + '/serviceAccounts/' +
                    Credentials.serviceAccountEmail + ':signJwt',
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer ' + (await this.getServiceAccountAccessToken()).access_token,
                    'Content-Type': 'application/json',
                },
                data: {
                    payload: JSON.stringify({
                        aud: ConfigGoogle.GOOGLE_EP_OAUTH2 + '/token',
                        exp: (now + 3600),
                        iat: now,
                        iss: Credentials.serviceAccountEmail,
                        target_audience: ConfigGoogle.DES_SERVICE_TARGET_AUDIENCE,
                    }),
                }
            })).data.signedJwt

            Credentials.serviceAccountIdToken = (await this.signJWT(signedToken) as IDTokenModel).id_token;
            Credentials.serviceAccountIdTokenExpiresIn =
                Utils.getExpTimeFromPayload(Credentials.serviceAccountIdToken) - KExpiresMargin;

            return Credentials.serviceAccountIdToken;

        } catch (error) {
            throw (Error.makeForHTTPRequest(error));
        }

    }

    // [OBSOLETE] to remove with /imptoken
    public async getServiceAccountAccessToken(useCached = true): Promise<IAccessTokenModel> {

        const now = Math.floor(Date.now() / 1000);
        if (useCached && Credentials.serviceAccountAccessToken &&
            Credentials.serviceAccountAccessTokenExpiresIn > now) {
            return Credentials.serviceAccountAccessToken;
        }

        if (ConfigGoogle.SERVICE_IDENTITY_PRIVATE_KEY) {
            const jwt = jwttoken.sign({
                aud: ConfigGoogle.GOOGLE_EP_OAUTH2 + '/token',
                exp: (now + 3600),
                iat: now,
                iss: ConfigGoogle.SERVICE_IDENTITY_EMAIL,
                scope: ConfigGoogle.GOOGLE_SCOPE_PLATFORM,
            }, ConfigGoogle.SERVICE_IDENTITY_PRIVATE_KEY, {
                header: {
                    alg: 'RS256',
                    kid: ConfigGoogle.SERVICE_IDENTITY_PRIVATE_KEY_ID,
                    typ: 'JWT',
                },
            });

            Credentials.serviceAccountAccessToken = await this.signJWT(jwt) as IAccessTokenModel;
            Credentials.serviceAccountAccessTokenExpiresIn =
                Math.floor(Date.now() / 1000) + Credentials.serviceAccountAccessToken.expires_in - KExpiresMargin;
            return Credentials.serviceAccountAccessToken;
        }

        const options = {
            headers: { 'Metadata-Flavor': 'Google' }
        };
        const url = ConfigGoogle.GOOGLE_EP_METADATA + '/instance/service-accounts/default/token';

        try {
            const results = await axios.get(url, options);
            Credentials.serviceAccountAccessToken = results.data;
            Credentials.serviceAccountAccessTokenExpiresIn =
                Math.floor(Date.now() / 1000) + Credentials.serviceAccountAccessToken.expires_in - KExpiresMargin;
            return Credentials.serviceAccountAccessToken;
        } catch (error) {
            throw (Error.makeForHTTPRequest(error));
        }
    }

    public async getServiceAccountEmail(): Promise<string> {

        if (Credentials.serviceAccountEmail) { return Credentials.serviceAccountEmail; }

        if (ConfigGoogle.SERVICE_IDENTITY_EMAIL) {
            Credentials.serviceAccountEmail = ConfigGoogle.SERVICE_IDENTITY_EMAIL;
            return Credentials.serviceAccountEmail;
        }

        const options = {
            headers: { 'Metadata-Flavor': 'Google' }
        };
        const url = ConfigGoogle.GOOGLE_EP_METADATA + '/instance/service-accounts/default/email';

        try {
            return (await axios.get(url, options)).data;
        } catch (error) {
            throw (Error.makeForHTTPRequest(error));
        }
    }

    // [OBSOLETE] to remove with /imptoken
    public getIAMResourceUrl(serviceSigner: string): string {
        return ConfigGoogle.GOOGLE_EP_IAM + '/projects/' + ConfigGoogle.SERVICE_CLOUD_PROJECT +
            '/serviceAccounts/' + serviceSigner + ':signJwt';
    }

    // [OBSOLETE] to remove with /imptoken
    public getAudienceForImpCredentials(): string {
        return ConfigGoogle.GOOGLE_EP_OAUTH2 + '/token';
    }

    // [OBSOLETE] to remove with /imptoken
    public getPublicKeyCertificatesUrl(): string {
        return ConfigGoogle.GOOGLE_EP_ROBOT + '/metadata/x509/' + Config.IMP_SERVICE_ACCOUNT_SIGNER;
    }

    // cache the services tokens
    private static serviceAccountEmail: string;
    private static serviceAccountAccessToken: IAccessTokenModel;
    private static serviceAccountAccessTokenExpiresIn = 0;
    private static serviceAccountIdToken: string;
    private static serviceAccountIdTokenExpiresIn = 0;

    public async signJWT(jwt: string): Promise<IDTokenModel | IAccessTokenModel> {
        try {
            return (await axios.request({
                url: ConfigGoogle.GOOGLE_EP_OAUTH2 + '/token',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                data: qs.stringify({
                    assertion: jwt,
                    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
                })
            })).data;
        } catch (error) {
            throw (Error.makeForHTTPRequest(error));
        }

    }

}
