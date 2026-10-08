// ============================================================================
// Copyright 2017-2025, Schlumberger
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
import { IbmConfig } from './config';
import { logger } from './logger';

// [TODO] all logger.info looks more DEBUG message should not be executed in production code
// [TODO] don't use any! use types
@DataEcosystemCoreFactory.register('ibm')
export class IbmDataEcosystemServices extends AbstractDataEcosystemCore {
    public fixGroupMembersResponse(groupMembers: any): IDESEntitlementGroupMembersModel {

        logger.info('in IbmDataEcosystemServices.fixGroupMembersResponse. Returning..');
        logger.debug(groupMembers);
        groupMembers = groupMembers.members;
        logger.debug(groupMembers);

        if (groupMembers && groupMembers.length === 0) {
            throw {
                error: {
                    message: 'NOT_FOUND'
                },
                statusCode: 404,
                name: 'StatusCodeError'
            };
        }

        if (groupMembers && groupMembers.length === 1) {
            return {
                members: [{
                    email: groupMembers[0].email,
                    role: 'OWNER'
                }],
                cursor: undefined
            } as IDESEntitlementGroupMembersModel;
        }

        const members = [];
        for (const member of groupMembers as any[]) {
            members.push({
                email: member.email,
                role: 'MEMBER'
            });
        }
        return {
            members,
            cursor: undefined
        } as IDESEntitlementGroupMembersModel;
    }

    public async getAuthorizationHeader(userToken: string): Promise<string> {
        logger.info('in IbmDataEcosystemServices.getAuthorizationHeader. Returning..');
        return userToken.startsWith('Bearer') ? userToken : 'Bearer ' + userToken;
    }

    public getComplianceBaseUrlPath(): string {
        logger.info('in IbmDataEcosystemServices.getComplianceBaseUrlPath. Returning..');
        return IbmConfig.COMPLIANCE_CONTEXT_PATH;
    };

    public getDataPartitionIDRestHeaderName(): string {
        logger.info('in IbmDataEcosystemServices.getDataPartitionIDRestHeaderName. Returning..');
        return 'data-partition-id';
    }

    public getEntitlementBaseUrlPath(): string {
        logger.info('in IbmDataEcosystemServices.getEntitlementBaseUrlPath. Returning..');
        return IbmConfig.ENTITLEMENT_CONTEXT_PATH;
    };

    public getStorageBaseUrlPath(): string {
        logger.info('in IbmDataEcosystemServices.getStorageBaseUrlPath. Returning..');
        return IbmConfig.STORAGE_CONTEXT_PATH;
    };

    public getUserAddBodyRequest(userEmail: string, role: string): { email: string, role: string; } | string[] {
        const userBody = {
            'email': userEmail,
            'role': role
        };
        logger.info('in IbmDataEcosystemServices.getUserAddBodyRequest. Returning..');
        return userBody;
    }

    public getPolicySvcBaseUrlPath(): string {
        return IbmConfig.POLICY_SVC_CONTEXT_PATH;
    }

    public tenantNameAndDataPartitionIDShouldMatch() {
        logger.info('in IbmDataEcosystemServices.tenantNameAndDataPartitionIDShouldMatch. Returning..');
        return true;
    }

    public getUserAssociationSvcBaseUrlPath(): string { return 'userAssociation/v1'; }

}