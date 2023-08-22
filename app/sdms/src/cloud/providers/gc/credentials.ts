// ============================================================================
// Copyright 2017-2021, Schlumberger
// Copyright 2023 Google LLC
// Copyright 2023 EPAM Systems
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

import { DownscopedClient, CredentialAccessBoundary, GoogleAuth, OAuth2Client, auth } from 'google-auth-library';
import { GCS_URL_SEPARATOR } from './constants'
import { Error} from '../../../shared';
import { AbstractCredentials, CredentialsFactory, IAccessTokenModel } from '../../credentials';

export class SubProjectPath {

    public bucket: string;
    public folder?: string | undefined;

    public constructor(path: string) {
        const splitPath = path.split('/');
        this.bucket = splitPath[0];
        this.folder = splitPath.slice(1).join('/');
    }

}


@CredentialsFactory.register('gc')
export class Credentials extends AbstractCredentials {

    public async getStorageCredentials(
        tenant: string, subproject: string,
        bucket: string, readonly: boolean, _partition: string, objectPrefix?: string): Promise<IAccessTokenModel> {
        const serviceAccessTokenDownscoped = await this.getSecurityAccessToken(
             bucket, readonly, objectPrefix);
        return serviceAccessTokenDownscoped;
    }

    private getFullObjectPrefix(folder?: string, objectPrefix?: string): string | null {
        if (folder && !objectPrefix) { // I miss a pattern-matching here
            return folder;
        } else if (!folder && objectPrefix) {
            return objectPrefix;
        } else if (folder && objectPrefix) {
            return folder + '/' + objectPrefix;
        } else {
            return null;
        }
    }

    private createCredentialsAccessBoundary(
        bucket: string,
        readonly: boolean,
        objectPrefix?: string): CredentialAccessBoundary {

        const subprojectPath = new SubProjectPath(bucket);
        const accessBoundaryRule = {
            'availableResource': '//storage.googleapis.com/projects/_/buckets/' + subprojectPath.bucket,
            'availablePermissions': [
                'inRole:roles/' + (readonly ? 'storage.objectViewer' : 'storage.objectAdmin')
            ],
        };
        const fullObjectPrefix = this.getFullObjectPrefix(subprojectPath.folder, objectPrefix);
        if (fullObjectPrefix) {
            accessBoundaryRule['availabilityCondition'] = {
                'title': 'obj-prefixes',
                'expression': 'resource.name.startsWith(\"projects/_/buckets/' +
                    subprojectPath.bucket + '/objects/' + fullObjectPrefix + '\")'
            };
        }
        const accessBoundary = {
            accessBoundary: {
                accessBoundaryRules: [
                    accessBoundaryRule
                ]
            }
        } as CredentialAccessBoundary;
        return accessBoundary;
    }

    private async getSecurityAccessToken(
        bucket: string, readonly: boolean, objectPrefix?: string): Promise<IAccessTokenModel>{
        try {
            const googleAuth = new GoogleAuth({
                scopes: 'https://www.googleapis.com/auth/cloud-platform'
            });
            const authClient = await googleAuth.getClient();
            const accessBoundary = this.createCredentialsAccessBoundary(bucket, readonly, objectPrefix);
            const downscopedClient = new DownscopedClient(authClient, accessBoundary);
            const tokenResponse = await downscopedClient.getAccessToken();
            const expiresIn = tokenResponse.expirationTime - Date.now();
            return {
                access_token: tokenResponse.token,
                expires_in: expiresIn,
                token_type: 'Bearer'
            };
        } catch (error) {
            throw (Error.makeForHTTPRequest(error));
        }
    }

    public async getServiceCredentials(): Promise<string> {
            return null;
    }

    // [OBSOLETE] to remove with /imptoken
    public async getServiceAccountAccessToken(useCached = true): Promise<IAccessTokenModel> {
        return null;
    }


    // [OBSOLETE] to remove with /imptoken
    public getIAMResourceUrl(serviceSigner: string): string {
        return null;
    }

    // [OBSOLETE] to remove with /imptoken
    public getAudienceForImpCredentials(): string {
        return null;
    }

    // [OBSOLETE] to remove with /imptoken
    public getPublicKeyCertificatesUrl(): string {
        return null;
    }

    private async parseAsAccessToken(client: OAuth2Client, userToken: string): Promise<string | undefined> {
        try {
            const tokenInfo = await client.getTokenInfo(userToken);
            return tokenInfo.sub;
        } catch (error) {
            return undefined;
        }
    }

    private async parseAsIdToken(client: OAuth2Client, userToken: string): Promise<string | undefined> {
        try {
            const loginTicket = await client.verifyIdToken({ idToken: userToken });
            const tokenInfo = loginTicket.getPayload();
            return tokenInfo.sub;
        } catch (error) {
            return undefined;
        }
    }

    /// TODO: Think about returning not only the sub field.
    public async getUserId(userToken: string): Promise<string> {
        let token: string;
        if (userToken.startsWith('Bearer ')) {
            token = userToken.replace('Bearer ', '');
        } else {
            token = userToken;
        };
        const client = new OAuth2Client();

        const userSub = await this.parseAsAccessToken(client, token)
            || await this.parseAsIdToken(client, token);

        if (!userSub) {
            const error = Error.make(
                Error.Status.UNAUTHENTICATED,
                'Can\'t parse token with Google API'
            )
            throw error;
        }
        return userSub;
    }
}
