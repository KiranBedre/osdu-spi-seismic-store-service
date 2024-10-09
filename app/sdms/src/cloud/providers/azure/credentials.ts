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

import { Error } from '../../../shared';
import { AbstractCredentials, CredentialsFactory, IAccessTokenModel } from '../../credentials';
import {
    ContainerSASPermissions,
    BlobServiceClient,
    generateBlobSASQueryParameters,
    SASProtocol,
    UserDelegationKey
} from '@azure/storage-blob';
import { DefaultAzureCredential } from '@azure/identity';
import { AzureDataEcosystemServices } from './dataecosystem';

const UserDelegationKeyValidityInMinutes = 3599; // expires at the same time as the sas token
const ExpirationLeadInMinutes = 15; // expire 15 minutes before actual date
const SasExpirationInMinutes = 3599; // shortly under 2.5 days

interface ICachedUserDelegationKey {
    key: UserDelegationKey;
    expiration: Date;
}

@CredentialsFactory.register('azure')
export class AzureCredentials extends AbstractCredentials {
    private delegationKeyMap: Map<string, ICachedUserDelegationKey>;
    public static defaultAzureCredential = new DefaultAzureCredential();

    public constructor() {
        super();
        this.delegationKeyMap = new Map<string, ICachedUserDelegationKey>();
    }

    // the sas token does not contain the virtual folder name for performance reasons.
    // if the virtual folder name is needed, it should be added to the sas token separately.
    public async getStorageCredentials(
        tenant: string, subproject: string,
        bucket: string,readonly: boolean,partition: string,objectPrefix?: string): Promise<IAccessTokenModel> {
        const accountName = await AzureDataEcosystemServices.getStorageResourceName(partition);
        const now = new Date();
        const expiration = this.addMinutes(now, SasExpirationInMinutes);
        const sasToken = await this.generateSASToken(accountName, bucket, expiration, readonly, objectPrefix);
        const result = {
            access_token: sasToken,
            expires_in: 3599,
            token_type: 'SasUrl',
        };
        return result;
    }

    private async generateSASToken(
        accountName: string, containerName: string, expiration: Date,
        readOnly: boolean, objectPrefix?: string
    ): Promise<string> {

        const blobServiceClient = new BlobServiceClient(
            `https://${accountName}.blob.core.windows.net`,
            AzureCredentials.defaultAzureCredential
        );

        const userDelegationKey = await this.getDelegationKey(blobServiceClient);

        const permissions = new ContainerSASPermissions();
        permissions.list = true;
        permissions.write = !readOnly;
        permissions.create = !readOnly;
        permissions.delete = !readOnly;
        permissions.read = true;

        const containerSAS = generateBlobSASQueryParameters({
            containerName,
            permissions,
            protocol: SASProtocol.Https,
            expiresOn: expiration
        }, userDelegationKey, // UserDelegationKey
            accountName);
        if (!objectPrefix) {
            return `https://${accountName}.blob.core.windows.net/${containerName}?${containerSAS.toString()}`;
        }
        return `https://${accountName}.blob.core.windows.net/${containerName}/${objectPrefix}?${containerSAS.toString()}`;
    }

    private async getDelegationKey(blobServiceClient: BlobServiceClient): Promise<UserDelegationKey> {
        const key = blobServiceClient.accountName;
        const now = new Date();
        const cache = this.delegationKeyMap.get(key);
        if (cache && cache.expiration > now) {
            return cache.key;
        }

        const expiresOn = this.addMinutes(now, UserDelegationKeyValidityInMinutes);

        // Getting a key that is valid from ExpirationLeadInMinutes ago, in order to handle clock differences
        const response = await blobServiceClient.getUserDelegationKey(
            this.addMinutes(now, -ExpirationLeadInMinutes),
            expiresOn);

        // Expiring the key ExpirationLeadInMinutes before it stops being valid in order to handle clock differences
        const keyExpiration = this.addMinutes(expiresOn, -ExpirationLeadInMinutes);
        this.delegationKeyMap.set(key, { key: response, expiration: keyExpiration });

        return response;
    }

    private addMinutes(d: Date, minutes: number): Date {
        return new Date(d.valueOf() + (minutes * 60 * 1000));
    }

    // [OBSOLETE] to remove with /imptoken
    public async getServiceAccountAccessToken(): Promise<IAccessTokenModel> {
        throw (Error.make(Error.Status.NOT_IMPLEMENTED, 'Method not implemented.'));
    }

    // [OBSOLETE] to remove with /imptoken
    public getIAMResourceUrl(serviceSigner: string): string {
        throw (Error.make(Error.Status.NOT_IMPLEMENTED, 'Method not implemented.'));
    }

    // [OBSOLETE] to remove with /imptoken
    public getAudienceForImpCredentials(): string {
        throw (Error.make(Error.Status.NOT_IMPLEMENTED, 'Method not implemented.'));
    }

    // [OBSOLETE] to remove with /imptoken
    public getPublicKeyCertificatesUrl(): string {
        throw (Error.make(Error.Status.NOT_IMPLEMENTED, 'Method not implemented.'));
    }

}
