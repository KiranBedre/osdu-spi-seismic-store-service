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

import { v4 as uuidv4 } from 'uuid';
import { Cos } from '.';
import { SubProjectModel } from '../../../services/subproject';
import { TenantModel } from '../../../services/tenant';
import { Error, Utils } from '../../../shared';
import { Config } from '../../config';
import { AbstractSeistore, SeistoreFactory } from '../../seistore';

@SeistoreFactory.register('ibm')
export class IbmSeistore extends AbstractSeistore {

    public checkExtraSubprojectCreateParams(requestBody: any, subproject: SubProjectModel) { return; }

    public async getEmailFromTokenPayload(
        userCredentials: string, internalSwapForSauth: boolean): Promise<string> { // swapSauthEmailClaimToV2=true
        const payload = Utils.getPayloadFromStringToken(userCredentials);
        const email = payload.email === Config.IMP_SERVICE_ACCOUNT_SIGNER ? payload.obo : payload.email;
        return internalSwapForSauth ? Utils.checkSauthV1EmailDomainName(email) : email;
    }

    // [TODO] Push an event when a subproject is created
    public async notifySubprojectCreationStatus(
        subproject: SubProjectModel, status: string): Promise<string> {
        return 'Not Implemented';
    }

    public async getDatasetStorageResource(_tenant: TenantModel, subproject: SubProjectModel): Promise<string> {
        return subproject.gcs_bucket + '/' + uuidv4();
    }

    public async getSubprojectStorageResources(_tenant: TenantModel, subproject: SubProjectModel): Promise<void> {
        await new Cos().createBucket(
            subproject.gcs_bucket, subproject.storage_location, subproject.storage_class);
    }

    public async deleteStorageResources(_tenant: TenantModel, subproject: SubProjectModel): Promise<void> {
        const storage = new Cos();
        // probably this line is not needed for ibm implementation.
        // deleting the bucket should be enough (logic abstracted from core)
        await storage.deleteFiles(subproject.gcs_bucket);
        await storage.deleteBucket(subproject.gcs_bucket);
    }

    public async handleReadinessCheck(): Promise<boolean> { return true; }


    public validateAccessPolicy(subproject: SubProjectModel, accessPolicy: string) {
        if (subproject.access_policy !== accessPolicy) {
            throw Error.make(Error.Status.BAD_REQUEST, 'Subproject access policy is not ' + accessPolicy);
        }
    }
}
