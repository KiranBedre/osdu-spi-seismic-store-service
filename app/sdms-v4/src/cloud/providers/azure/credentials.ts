// ============================================================================
// Copyright 2017-2022, Schlumberger
//
// Licensed under the Apache License, Version 2.0 (the "License");
// You may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// Distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// Limitations under the License.
// ============================================================================

import { AbstractCredentials, CredentialsFactory, IAccessTokenModel } from '../../credentials';
import { AccessToken, GetTokenOptions } from '@azure/core-auth';
import {
    BlobServiceClient,
    ContainerSASPermissions,
    SASProtocol,
    UserDelegationKey,
    generateBlobSASQueryParameters,
} from '@azure/storage-blob';
import { DefaultAzureCredential, DefaultAzureCredentialOptions, TokenCredential } from '@azure/identity';

import { AzureConfig } from './config';
import { ExponentialRetryPolicyOptions } from '@azure/core-rest-pipeline';
import { PartitionCoreService } from '../../../services';

const UserDelegationKeyValidityInMinutes = 60 * 4; // 4 hours
const ExpirationLeadInMinutes = 15; // Expire 15 minutes before actual date
const SasExpirationInMinutes = 3599; // Shortly under 2.5 days

interface ICachedUserDelegationKey {
    key: UserDelegationKey;
    expiration: Date;
}

@CredentialsFactory.register('azure')
export class AzureCredentials extends AbstractCredentials {
    private delegationKeyMap: Map<string, ICachedUserDelegationKey>;
    private defaultAzureCredential: TokenCredential;

    public constructor() {
        super();
        this.delegationKeyMap = new Map<string, ICachedUserDelegationKey>();
        this.defaultAzureCredential = AzureCredentials.getCredential();
    }

    public static getCredential(): TokenCredential {
        // To leverage managed identity when running locally,
        // The local environment expects the following three environment variables:
        // - AZURE_TENANT_ID: The tenant ID in Azure Active Directory
        // - AZURE_CLIENT_ID: The application (client) ID registered in the AAD tenant
        // - AZURE_CLIENT_SECRET: The client secret for the registered application
        // https://docs.microsoft.com/en-us/azure/active-directory/managed-identities-azure-resources/overview

        return new RetriableAzureCredential();
    }

    public async getServiceCredentials(): Promise<string> {
        return (await AzureCredentials.getCredential().getToken(AzureConfig.APP_RESOURCE_ID + '/.default')).token;
    }

    public async getStorageCredentials(
        bucket: string,
        readonly: boolean,
        partition: string
    ): Promise<IAccessTokenModel> {
        const accountName = await PartitionCoreService.getStorageResource(partition);
        const now = new Date();
        const expiration = this.addMinutes(now, SasExpirationInMinutes);
        const sasToken = await this.generateSASToken(accountName, bucket, expiration, readonly);
        const result = {
            access_token: sasToken,
            expires_in: 3599,
            token_type: 'SasUrl',
        };
        return result;
    }

    private async generateSASToken(
        accountName: string,
        containerName: string,
        expiration: Date,
        readOnly: boolean
    ): Promise<string> {
        const blobServiceClient = new BlobServiceClient(
            `https://${accountName}.blob.core.windows.net`,
            this.defaultAzureCredential
        );

        const userDelegationKey = await this.getDelegationKey(blobServiceClient);

        const permissions = new ContainerSASPermissions();
        permissions.list = true;
        permissions.write = !readOnly;
        permissions.create = !readOnly;
        permissions.delete = !readOnly;
        permissions.read = true;

        const containerSAS = generateBlobSASQueryParameters(
            {
                containerName,
                permissions,
                protocol: SASProtocol.Https,
                expiresOn: expiration,
            },
            userDelegationKey,
            accountName
        );
        return `https://${accountName}.blob.core.windows.net/${containerName}?${containerSAS.toString()}`;
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
            expiresOn
        );

        // Expiring the key ExpirationLeadInMinutes before it stops being valid in order to handle clock differences
        const keyExpiration = this.addMinutes(expiresOn, -ExpirationLeadInMinutes);
        this.delegationKeyMap.set(key, {
            key: response,
            expiration: keyExpiration,
        });

        return response;
    }

    private addMinutes(d: Date, minutes: number): Date {
        return new Date(d.valueOf() + minutes * 60 * 1000);
    }
}

class RetriableAzureCredential extends DefaultAzureCredential {
    private static DefaultRetryCount = 10;
    private static DefaultRetryInterval = 1000;
    private static DefaultMaxRetryInterval = 64 * 1000;
    private static DefaultRequestTimeout = 5 * 1000;

    private options: ExponentialRetryPolicyOptions = {
        maxRetries: RetriableAzureCredential.DefaultRetryCount,
        retryDelayInMs: RetriableAzureCredential.DefaultRetryInterval, // Not supported yet
        maxRetryDelayInMs: RetriableAzureCredential.DefaultMaxRetryInterval, // Not supported yet
    };

    private credentials: DefaultAzureCredential;

    private defaultRequestOptions = {
        requestOptions: {
            timeout: RetriableAzureCredential.DefaultRequestTimeout,
        },
    };

    public constructor(tokenCredentialOptions?: DefaultAzureCredentialOptions) {
        super(tokenCredentialOptions);
        const retryOptions = tokenCredentialOptions?.retryOptions;
        this.options = { ...this.options, ...retryOptions };
        this.credentials = new DefaultAzureCredential();
    }

    public getToken(scopes: string | string[], options?: GetTokenOptions): Promise<AccessToken> {
        const requestOptions = { ...options, ...this.defaultRequestOptions };
        return this.retry(() => this.credentials.getToken(scopes, requestOptions));
    }

    private retry<T>(fn: () => Promise<T>, retries: number | undefined = this.options.maxRetries): Promise<T> {
        if (retries && retries <= 0) {
            return Promise.reject('Failed after several attempts');
        }

        const prom = fn();
        return prom.then((res) => prom).catch((err) => this.retry(fn, retries! - 1));
    }
}
