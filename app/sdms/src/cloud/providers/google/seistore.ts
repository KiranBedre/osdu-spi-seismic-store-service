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

import { PubSub } from '@google-cloud/pubsub';
import { v4 as uuidv4 } from 'uuid';
import { GCS } from '.';
import { SubProjectModel } from '../../../services/subproject';
import { TenantModel } from '../../../services/tenant';
import { Error, Params, Utils } from '../../../shared';
import { Config } from '../../config';
import { AbstractSeistore, SeistoreFactory } from '../../seistore';
import { ConfigGoogle } from './config';

// reference time zone and class locations
const KSTORAGE_CLASS = ['MULTI_REGIONAL', 'REGIONAL', 'NEARLINE', 'CODDLING'];
const KSTORAGE_LOCATION_MR = ['ASIA', 'EU', 'US'];
const KSTORAGE_LOCATION_RG = [
    'NORTHAMERICA-NORTHEAST1',
    'NORTHAMERICA-NORTHEAST2',
    'US-CENTRAL1',
    'US-EAST1',
    'US-EAST4',
    'US-WEST1',
    'US-WEST2',
    'US-WEST3',
    'US-WEST4',
    'SOUTHAMERICA-EAST1',
    'EUROPE-CENTRAL2',
    'EUROPE-NORTH1',
    'EUROPE-WEST1',
    'EUROPE-WEST2',
    'EUROPE-WEST3',
    'EUROPE-WEST4',
    'EUROPE-WEST6',
    'ASIA-EAST1',
    'ASIA-EAST2',
    'ASIA-NORTHEAST1',
    'ASIA-NORTHEAST2',
    'ASIA-NORTHEAST3',
    'ASIA-SOUTH1',
    'ASIA-SOUTH2',
    'ASIA-SOUTHEAST1',
    'ASIA-SOUTHEAST2',
    'AUSTRALIA-SOUTHEAST1',
    'AUSTRALIA-SOUTHEAST2'];

@SeistoreFactory.register('google')
export class GoogleSeistore extends AbstractSeistore {

    private pubSubClient: PubSub;

    constructor() {
        super();
        this.pubSubClient = new PubSub();
    }

    public checkExtraSubprojectCreateParams(requestBody: any, subproject: SubProjectModel) {

        subproject.storage_class = requestBody.storage_class;
        subproject.storage_location = requestBody.storage_location;

        Params.checkString(subproject.storage_class, 'storage_class');
        Params.checkString(subproject.storage_location, 'storage_location');

        subproject.storage_class = subproject.storage_class.toUpperCase();
        subproject.storage_location = subproject.storage_location.toUpperCase();

        //  check if the storage class
        if (KSTORAGE_CLASS.indexOf(subproject.storage_class) === -1) {
            throw (Error.make(Error.Status.BAD_REQUEST,
                'The storage_class body field ' + subproject.storage_class +
                ' is not valid. It must be one of ' + KSTORAGE_CLASS.join(', ')));
        }

        // check the storage location
        if (KSTORAGE_LOCATION_MR.indexOf(subproject.storage_location) === -1 &&
            KSTORAGE_LOCATION_RG.indexOf(subproject.storage_location) === -1) {
            throw (Error.make(Error.Status.BAD_REQUEST,
                'The storage_location body field ' + subproject.storage_location +
                ' is not valid. It must be one of ' +
                (KSTORAGE_LOCATION_MR.concat(KSTORAGE_LOCATION_RG)).join(', ')));
        }

        // check the storage location
        if (subproject.storage_class === 'MULTI_REGIONAL' &&
            KSTORAGE_LOCATION_RG.indexOf(subproject.storage_location) > -1) {
            throw (Error.make(Error.Status.BAD_REQUEST,
                'The storage_location body field ' + subproject.storage_location +
                ' is a regional storage location and it\'s not valid for a MULTI_REGIONAL' +
                ' storage class. It must be one of ' + KSTORAGE_LOCATION_MR.join(', ')));
        }

        // check the storage location
        if (subproject.storage_class === 'REGIONAL' &&
            KSTORAGE_LOCATION_MR.indexOf(subproject.storage_location) > -1) {
            throw (Error.make(Error.Status.BAD_REQUEST,
                'The storage_location body field ' + subproject.storage_location +
                ' is a multi regional storage location and it\'s not valid for a REGIONAL' +
                ' storage class. It must be one of ' + KSTORAGE_LOCATION_RG.join(', ')));
        }

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
