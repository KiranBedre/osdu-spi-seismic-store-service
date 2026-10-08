// ============================================================================
// Copyright 2017-2019, Schlumberger
// Copyright 2023 Google LLC
// Copyright 2023 EPAM Systems
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

import { PubSub } from '@google-cloud/pubsub';
import { v4 as uuidv4 } from 'uuid';
import { GCS } from '.';
import { SubProjectModel } from '../../../services/subproject';
import { TenantModel } from '../../../services/tenant';
import { Utils } from '../../../shared';
import { Config } from '../../config';
import { AbstractSeistore, SeistoreFactory } from '../../seistore';
import { ConfigGoogle } from './config';


@SeistoreFactory.register('gc')
export class GoogleSeistore extends AbstractSeistore {

    private pubSubClient: PubSub;

    constructor() {
        super();
        this.pubSubClient = new PubSub();
    }

    public checkExtraSubprojectCreateParams(requestBody: any, subproject: SubProjectModel) {

        /**
         * It is not a user's responsibility to manage STORAGE classes for Seismic subprojects
         */
        return null;
    }

    public async getEmailFromTokenPayload(
        userCredentials: string, internalSwapForSauth: boolean): Promise<string> { // swapSauthEmailClaimToV2=true
        const payload = Utils.getPayloadFromStringToken(userCredentials);
        const email = payload.email === Config.IMP_SERVICE_ACCOUNT_SIGNER ? payload.obo : payload.email;
        return internalSwapForSauth ? Utils.checkSauthV1EmailDomainName(email) : email;
    }

    public async notifySubprojectCreationStatus(subproject: SubProjectModel, status: string): Promise<string> {

        const data = JSON.stringify({
            subproject,
            type: 'subproject',
            status
        });

        const pubSubTopic = 'projects/' + ConfigGoogle.SERVICE_CLOUD_PROJECT + '/topics/' + ConfigGoogle.PUBSUBTOPIC;
        const dataBuffer = Buffer.from(data);

        try {
            const messageID = await this.pubSubClient
                .topic(pubSubTopic)
                .publish(dataBuffer);
            return messageID;
        } catch (error) {
            return null;
        }
    }

    public async getDatasetStorageResource(_tenant: TenantModel, subproject: SubProjectModel): Promise<string> {
        return subproject.gcs_bucket + '/' + uuidv4();
    }

    public async getSubprojectStorageResources(tenant: TenantModel, subproject: SubProjectModel): Promise<void> {
        await new GCS(tenant).createBucket(
            subproject.gcs_bucket, subproject.storage_location, subproject.storage_class);
    }

    public async deleteStorageResources(tenant: TenantModel, subproject: SubProjectModel): Promise<void> {
        const storage = new GCS(tenant);
        await storage.deleteBucket(subproject.gcs_bucket);
    }

    public async handleReadinessCheck(): Promise<boolean> { return true; }

    public validateAccessPolicy(subproject: SubProjectModel, accessPolicy: string) {
        return;
    }

}
