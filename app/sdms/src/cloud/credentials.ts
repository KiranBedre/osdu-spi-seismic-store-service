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

import { CloudFactory } from './cloud';

export interface IAccessTokenModel {
    access_token: string;
    expires_in: number;
    token_type: string;
}

export interface ICredentials {
    getStorageCredentials(
        tenant: string, subproject: string,
        bucket: string, readonly: boolean, partitionID: string, objectPrefix?: string): Promise<IAccessTokenModel>;
    getServiceAccountAccessToken(): Promise<IAccessTokenModel>;
    getIAMResourceUrl(serviceSigner: string): string;
    getAudienceForImpCredentials(): string;
    getPublicKeyCertificatesUrl(): string;
    getUserId(userToken: string): Promise<string>;
}

export abstract class AbstractCredentials implements ICredentials {
    public abstract getStorageCredentials(
        tenant: string, subproject: string,
        bucket: string, readonly: boolean, partitionID: string, objectPrefix?: string): Promise<IAccessTokenModel>;
    // [OBSOLETE] to remove with /imptoken
    public abstract getServiceAccountAccessToken(): Promise<IAccessTokenModel>;
    // [OBSOLETE] to remove with /imptoken
    public abstract getIAMResourceUrl(serviceSigner: string): string;
    // [OBSOLETE] to remove with /imptoken
    public abstract getAudienceForImpCredentials(): string;
    // [OBSOLETE] to remove with /imptoken
    public abstract getPublicKeyCertificatesUrl(): string;

    public async getUserId(userToken: string): Promise<string> {
        throw new Error('Not implemented ');
    }
}

export class CredentialsFactory extends CloudFactory {
    public static build(providerLabel: string, args: { [key: string]: any; } = {}): ICredentials {
        return CloudFactory.build(providerLabel, AbstractCredentials, args) as ICredentials;
    }
}

