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

export interface IDESEntitlementGroupModel {
    name: string;
    description: string;
    email: string;
}

export interface IDESEntitlementMemberModel {
    email: string;
    role: string;
}

export interface IDESEntitlementGroupMembersModel {
    members: IDESEntitlementMemberModel[];
    cursor: string;
}

export interface IDataEcosystemCore {
    getDataPartitionIDRestHeaderName(): string;
    getAuthorizationHeader(userToken: string): Promise<string>;
    getEntitlementBaseUrlPath(): string;
    getComplianceBaseUrlPath(): string;
    getStorageBaseUrlPath(): string;
    getUserAssociationSvcBaseUrlPath(): string;
    getPolicySvcBaseUrlPath(): string;
    fixGroupMembersResponse(groupMembers: any): IDESEntitlementGroupMembersModel;
    getUserAddBodyRequest(userEmail: string, role: string): { email: string, role: string; } | string[];
    tenantNameAndDataPartitionIDShouldMatch(): boolean;
}

export abstract class AbstractDataEcosystemCore implements IDataEcosystemCore {
    public abstract getDataPartitionIDRestHeaderName(): string;
    public abstract getAuthorizationHeader(userToken: string): Promise<string>;
    public abstract getEntitlementBaseUrlPath(): string;
    public abstract getComplianceBaseUrlPath(): string;
    public abstract getStorageBaseUrlPath(): string;
    public abstract getUserAssociationSvcBaseUrlPath(): string;
    public abstract getPolicySvcBaseUrlPath(): string;
    public abstract fixGroupMembersResponse(groupMembers: any): IDESEntitlementGroupMembersModel;
    public abstract getUserAddBodyRequest(userEmail: string, role: string): { email: string, role: string; } | string[];
    public abstract tenantNameAndDataPartitionIDShouldMatch(): boolean;
}

export class DataEcosystemCoreFactory extends CloudFactory {
    public static build(providerLabel: string, args: { [key: string]: any; } = {}): IDataEcosystemCore {
        return CloudFactory.build(providerLabel, AbstractDataEcosystemCore, args) as IDataEcosystemCore;
    }
}
