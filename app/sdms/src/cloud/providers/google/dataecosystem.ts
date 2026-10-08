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

import {
    AbstractDataEcosystemCore,
    DataEcosystemCoreFactory,
    IDESEntitlementGroupMembersModel
} from '../../dataecosystem';
import { ConfigGoogle } from './config';
import { Credentials } from './credentials';

@DataEcosystemCoreFactory.register('google')
export class GoogleDataEcosystemServices extends AbstractDataEcosystemCore {
    public getDataPartitionIDRestHeaderName(): string { return ConfigGoogle.DATA_PARTITION_REST_HEADER_KEY; }
    public getEntitlementBaseUrlPath(): string { return ConfigGoogle.ENTITLEMENT_BASE_URL_PATH; };
    public getComplianceBaseUrlPath(): string { return '/legal/v1'; };
    public getStorageBaseUrlPath(): string { return '/storage/v2'; };
    public getUserAssociationSvcBaseUrlPath(): string { return 'userAssociation/v1'; }
    public getPolicySvcBaseUrlPath(): string { return 'api/policy/v1'; }

    public async getAuthorizationHeader(userToken: string): Promise<string> {
        return 'Bearer ' + await new Credentials().getServiceCredentials();
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

}