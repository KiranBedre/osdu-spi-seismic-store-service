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

import { SubProjectModel } from '../services/subproject';
import { TenantModel } from '../services/tenant';
import { CloudFactory } from './cloud';
import { Response as expResponse } from 'express';

export interface ISeistore {
    checkExtraSubprojectCreateParams(requestBody: any, subproject: SubProjectModel): void;
    getEmailFromTokenPayload(userCredentials: string, internalSwapForSauth: boolean): Promise<string>;
    notifySubprojectCreationStatus(subproject: SubProjectModel, status: string): Promise<string>;
    getDatasetStorageResource(tenant: TenantModel, subproject: SubProjectModel): Promise<string>;
    getSubprojectStorageResources(tenant: TenantModel, subproject: SubProjectModel): Promise<void>;
    deleteStorageResources(tenant: TenantModel, subproject: SubProjectModel): Promise<void>;
    handleReadinessCheck(): Promise<boolean>;
    validateAccessPolicy(subproject: SubProjectModel, accessPolicy: string): void;
}

export abstract class AbstractSeistore implements ISeistore {
    public abstract checkExtraSubprojectCreateParams(requestBody: any, subproject: SubProjectModel): void;
    public abstract getEmailFromTokenPayload(userCredentials: string, internalSwapForSauth: boolean): Promise<string>;
    public abstract notifySubprojectCreationStatus(subproject: SubProjectModel, status: string): Promise<string>;
    public abstract getDatasetStorageResource(tenant: TenantModel, subproject: SubProjectModel): Promise<string>;
    public abstract getSubprojectStorageResources(tenant: TenantModel, subproject: SubProjectModel): Promise<void>;
    public abstract deleteStorageResources(tenant: TenantModel, subproject: SubProjectModel): Promise<void>;
    public abstract handleReadinessCheck(): Promise<boolean>;
    public abstract validateAccessPolicy(subproject: SubProjectModel, accessPolicy: string);
}

export class SeistoreFactory extends CloudFactory {
    public static build(providerLabel: string): ISeistore {
        return CloudFactory.build(providerLabel, AbstractSeistore) as ISeistore;
    }
}
