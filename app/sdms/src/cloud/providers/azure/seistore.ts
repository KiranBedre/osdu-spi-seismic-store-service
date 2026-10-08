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

import { v4 as uuidv4 } from 'uuid';
import { AzureCloudStorage } from './cloudstorage';
import { SubProjectModel } from '../../../services/subproject';
import { TenantModel } from '../../../services/tenant';
import { Error, Utils } from '../../../shared';
import { Config } from '../../config';
import { AbstractSeistore, SeistoreFactory } from '../../seistore';
import { AzureConfig, AzureInsightsLogger } from '.';
import { AzureCredentials } from './credentials';

@SeistoreFactory.register('azure')
export class AzureSeistore extends AbstractSeistore {

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

    // return a storage location or create a storage resource based on applied access policy
    public async getDatasetStorageResource(tenant: TenantModel, subproject: SubProjectModel): Promise<string> {
        // dataset access policy, created a dedicated container for store dataset bulk objects
        if (subproject.access_policy === Config.DATASET_ACCESS_POLICY) {
            let containerName = subproject.gcs_bucket + '-' + uuidv4();
            containerName = containerName.substr(0, Math.min(containerName.length, 63)); // container name < 63 chars
            await new AzureCloudStorage(tenant).createBucket(containerName, undefined, undefined);
            return containerName;
        }
        // uniform access policy, return a unique location in bucket (to use as prefix in the dataset object uri)
        return subproject.gcs_bucket + '/' + uuidv4();
    }

    // create the subproject storage resource based on applied access policy.
    public async getSubprojectStorageResources(tenant: TenantModel, subproject: SubProjectModel): Promise<void> {
        // if the the access policy is set to dataset, we don't need a subproject container.
        // each dataset will have its own dedicated container resource (created one a dataset is registered)
        if (subproject.access_policy === Config.UNIFORM_ACCESS_POLICY) {
            await new AzureCloudStorage(tenant).createBucket(
                subproject.gcs_bucket, subproject.storage_location, subproject.storage_class);
        }
    }

    // remove the subproject storage resource based on applied access policy
    public async deleteStorageResources(tenant: TenantModel, subproject: SubProjectModel): Promise<void> {
        const storage = new AzureCloudStorage(tenant);
        if (subproject.access_policy === Config.UNIFORM_ACCESS_POLICY) {
            // probably this line is not needed for azure implementation.
            // deleting the bucket should be enough (logic abstracted from core)
            await storage.deleteFiles(subproject.gcs_bucket);
            await storage.deleteBucket(subproject.gcs_bucket);
        } else {
            // dataset access policy, delete all containers/buckets (one per dataset)
            storage.deleteBuckets(subproject.gcs_bucket).catch((err) => {
                new AzureInsightsLogger().error(err);
            });
        }
    }

    public async handleReadinessCheck(): Promise<boolean> {
        try {
            const credentials = AzureCredentials.defaultAzureCredential;
            const scope = AzureConfig.APP_RESOURCE_ID;
            await credentials.getToken(`${scope}/.default`);
            return true;
        } catch (error: any) {
            return false;
        }
    }

    public validateAccessPolicy(subproject: SubProjectModel, accessPolicy: string) {
        if (subproject.access_policy !== accessPolicy) {
            throw Error.make(Error.Status.BAD_REQUEST, 'Subproject access policy is not ' + accessPolicy);
        }
    }
}
