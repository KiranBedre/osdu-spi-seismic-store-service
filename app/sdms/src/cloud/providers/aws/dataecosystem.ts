// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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
import axios from 'axios';
import { getInMemoryCacheInstance } from '../../../shared';
import {
    AbstractDataEcosystemCore,
    DataEcosystemCoreFactory,
    IDESEntitlementGroupMembersModel
} from '../../dataecosystem';
import { AWSConfig } from './config';
import { AWSCredentials } from './credentials';

interface PartitionInfoAws {
    tenantId: string;
    expires_in: number;
}
@DataEcosystemCoreFactory.register('aws')
export class AWSDataEcosystemServices extends AbstractDataEcosystemCore {
    public getDataPartitionIDRestHeaderName(): string { return 'data-partition-id'; }
    public getEntitlementBaseUrlPath(): string { return '/api/entitlements/v2'; }
    public getComplianceBaseUrlPath(): string { return '/api/legal/v1'; }
    public getStorageBaseUrlPath(): string { return '/api/storage/v2'; }
    public getUserAssociationSvcBaseUrlPath(): string { return 'userAssociation/v1'; }
    public static getPartitionBaseUrlPath(): string { return '/api/partition/v1/partitions/'; }
    public getPolicySvcBaseUrlPath(): string { return 'api/policy/v1'; }

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
        return false;
    }

    public static async getTenantIdFromPartitionID(dataPartitionID: string): Promise<string> {
        const cache = getInMemoryCacheInstance();
        const cacheKey = 'aws-tenant' + dataPartitionID;
        const res = cache.get<string>(cacheKey);
        if (res !== undefined) {
            return res;
        }
        const token = await AWSCredentials.getServiceCredentials();
        const options = {
            headers: {
                'Accept': 'application/json',
                'Authorization': 'Bearer ' + token,
                'Content-Type': 'application/json'
            }
        };
        const url = AWSConfig.DES_SERVICE_HOST_PARTITION +
        AWSDataEcosystemServices.getPartitionBaseUrlPath() + dataPartitionID;

        try {
            const results = await axios.get(url, options);
            const response = results.data;
            const tenantInfo = response['tenantId']['value'];
            cache.set<string>(cacheKey, tenantInfo, 3600);
            return tenantInfo;
        }
        catch (err) {
            console.log(err.code + ': ' + err.message);
        }
    }
}
