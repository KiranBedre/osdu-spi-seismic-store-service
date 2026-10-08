// ============================================================================
// Copyright 2017-2024, Schlumberger
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

import axios from 'axios';
import { Error, getInMemoryCacheInstance } from '../../../shared';
import {
    AbstractDataEcosystemCore,
    DataEcosystemCoreFactory,
    IDESEntitlementGroupMembersModel
} from '../../dataecosystem';
import { AzureConfig } from './config';
import { AzureCredentials } from './credentials';
import { KeyVault } from './keyvault';

@DataEcosystemCoreFactory.register('azure')
export class AzureDataEcosystemServices extends AbstractDataEcosystemCore {

    public getUserAssociationSvcBaseUrlPath(): string { return 'userAssociation/v1'; }
    public getDataPartitionIDRestHeaderName(): string { return 'data-partition-id'; }
    public getEntitlementBaseUrlPath(): string { return '/api/entitlements/v2'; };
    public getComplianceBaseUrlPath(): string { return '/api/legal/v1'; };
    public getStorageBaseUrlPath(): string { return '/api/storage/v2'; };
    public getPolicySvcBaseUrlPath(): string { return '/api/policy/v1'; }

    public async getAuthorizationHeader(userToken: string): Promise<string> {
        return userToken.startsWith('Bearer') ? userToken : 'Bearer ' + userToken;
    }

    public fixGroupMembersResponse(groupMembers: any): IDESEntitlementGroupMembersModel {
        return groupMembers as IDESEntitlementGroupMembersModel;
    }

    public getUserAddBodyRequest(userEmail: string, role: string): { email: string, role: string; } | string[] {
        return { email: userEmail, role };
    }

    public tenantNameAndDataPartitionIDShouldMatch() {
        return true;
    }

    public static async getPartitionConfiguration(dataPartitionID: string): Promise<any> {
        const options = {
            headers: {
                'Accept': 'application/json',
                'Authorization': 'Bearer ' + (
                    // eslint-disable-next-line @stylistic/max-len
                    await  AzureCredentials.defaultAzureCredential.getToken(AzureConfig.APP_RESOURCE_ID + '/.default')).token,
                'Content-Type': 'application/json'
            }
        };
        const url = AzureConfig.DES_SERVICE_HOST_PARTITION + '/api/partition/v1/partitions/' + dataPartitionID;
        const results = await axios.get(url, options).catch((error) => {
            throw (Error.makeForHTTPRequest(error));
        });
        return results.data;
    }

    public static async getStorageResourceName(dataPartitionID: string): Promise<string> {

        const cache = getInMemoryCacheInstance();
        const cacheKey = 'azure-storage-resource-name-' + dataPartitionID;
        const res = cache.get<string>(cacheKey);
        if (res !== undefined) { return res; };

        const dataPartitionConfigurations = await AzureDataEcosystemServices.getPartitionConfiguration(dataPartitionID);
        const storageConfigs = (dataPartitionConfigurations[KeyVault.DATA_PARTITION_STORAGE_ACCOUNT_NAME] as {
            sensitive: boolean, value: string;
        });
        if (storageConfigs.sensitive) {
            storageConfigs.value = (await KeyVault.CreateSecretClient().getSecret(storageConfigs.value)).value;
        }
        cache.set<string>(cacheKey, storageConfigs.value, 3600);
        return storageConfigs.value;
    }

    public static async getStorageResourceKey(dataPartitionID: string): Promise<string> {

        const cache = getInMemoryCacheInstance();
        const cacheKey = 'azure-storage-resource-key-' + dataPartitionID;
        const res = cache.get<string>(cacheKey);
        if (res !== undefined) { return res; };

        const dataPartitionConfigurations = await AzureDataEcosystemServices.getPartitionConfiguration(dataPartitionID);
        const storageConfigs = (dataPartitionConfigurations[KeyVault.DATA_PARTITION_STORAGE_ACCOUNT_KEY] as {
            sensitive: boolean, value: string;
        });
        if (storageConfigs.sensitive) {
            storageConfigs.value = (await KeyVault.CreateSecretClient().getSecret(storageConfigs.value)).value;
        }
        cache.set<string>(cacheKey, storageConfigs.value, 3600);
        return storageConfigs.value;
    }

    public static async getCosmosConnectionParams(
        dataPartitionID: string): Promise<{ endpoint: string, key: string; }> {

        const cache = getInMemoryCacheInstance();
        const cacheKey = 'azure-cosmos-' + dataPartitionID;
        const res = cache.get<string>(cacheKey);
        if (res !== undefined) { return JSON.parse(res); };

        const dataPartitionConfigurations = await AzureDataEcosystemServices.getPartitionConfiguration(dataPartitionID);

        const cosmosEndpointConfigs = (dataPartitionConfigurations[KeyVault.DATA_PARTITION_COSMOS_ENDPOINT] as {
            sensitive: boolean, value: string;
        });
        if (cosmosEndpointConfigs.sensitive) {
            cosmosEndpointConfigs.value = (await KeyVault.CreateSecretClient().getSecret(
                cosmosEndpointConfigs.value)).value;
        }

        const cosmosKeyConfigs = (dataPartitionConfigurations[KeyVault.DATA_PARTITION_COSMOS_PRIMARY_KEY] as {
            sensitive: boolean, value: string;
        });
        if (cosmosKeyConfigs.sensitive) {
            cosmosKeyConfigs.value = (await KeyVault.CreateSecretClient().getSecret(
                cosmosKeyConfigs.value)).value;
        }

        cache.set<string>(cacheKey, JSON.stringify({
            endpoint: cosmosEndpointConfigs.value, key: cosmosKeyConfigs.value
        }), 3600);

        // return storageConfigs.value;
        return { endpoint: cosmosEndpointConfigs.value, key: cosmosKeyConfigs.value };
    }

}
