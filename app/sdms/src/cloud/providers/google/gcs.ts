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

import { Storage } from '@google-cloud/storage';
import { TenantModel } from '../../../services/tenant';
import { Config } from '../../config';
import { LoggerFactory } from '../../logger';
import { AbstractStorage, StorageFactory } from '../../storage';
import { ConfigGoogle } from './config';

@StorageFactory.register('google')
export class GCS extends AbstractStorage {
    private KMaxResults = 100;
    private GCS_BUCKET_PREFIX = 'ss-' + ConfigGoogle.SERVICE_ENV;
    private projectID: string;

    private static clientsCache: { [key: string]: Storage; } = {};

    public constructor(tenant: TenantModel) {
        super();
        this.projectID = tenant?.gcpid;

    }

    private getStorageClient(): Storage {
        if (GCS.clientsCache[this.projectID]) {
            return GCS.clientsCache[this.projectID];
        } else {
            GCS.clientsCache[this.projectID] = new Storage({
                keyFilename: ConfigGoogle.SERVICE_IDENTITY_KEY_FILENAME,
                projectId: this.projectID,
            });
            return GCS.clientsCache[this.projectID];
        }
    }

    // generate a random bucket name
    public async randomBucketName(): Promise<string> {
        let suffix = Math.random().toString(36).substring(2, 16);
        suffix = suffix + Math.random().toString(36).substring(2, 16);
        suffix = suffix.substr(0, 16);
        return this.GCS_BUCKET_PREFIX + '-' + suffix;
    }

    // Create a new bucket
    public async createBucket(
        bucketName: string, location: string, storageClass: string): Promise<void> {
        const bucket = this.getStorageClient().bucket(bucketName);

        await bucket.create({ location, storageClass });
        await bucket.setMetadata({
            iamConfiguration: {
                uniformBucketLevelAccess: {
                    enabled: false
                }
            }
        });
    }

    // Delete a bucket
    public async deleteBucket(bucketName: string, force = false): Promise<void> {
        await this.getStorageClient().bucket(bucketName).delete();
    }

    // Delete all files in a bucket
    public async deleteFiles(bucketName: string): Promise<void> {
        await this.getStorageClient().bucket(bucketName).deleteFiles();
    }

    // save an object/file to a bucket
    public async saveObject(bucketName: string, objectName: string, data: string): Promise<void> {
        // Create and save the file
        await this.getStorageClient().bucket(bucketName).file(objectName).save(data);
    }

    // delete multiple objects
    public async deleteObjects(bucketName: string, prefix: string): Promise<void> {
        prefix = prefix ? (prefix + '/').replace('//', '/') : prefix;
        this.getStorageClient().bucket(bucketName).deleteFiles(
            { prefix, force: true }).catch(
                (error) => { LoggerFactory.build(Config.CLOUDPROVIDER).error(JSON.stringify(error)); });
    }

    // copy multiple objects (skip the dummy file)
    public async copy(bucketIn: string, prefixIn: string, bucketOut: string, prefixOut: string, ownerEmail: string) {

        if (prefixIn) {
            prefixIn += '/';
            while (prefixIn.indexOf('//') !== -1) {
                prefixIn = prefixIn.replace('//', '/');
            }
        }
        if (prefixOut) {
            prefixOut += '/';
            while (prefixOut.indexOf('//') !== -1) {
                prefixOut = prefixOut.replace('//', '/');
            }
        }

        const rmPrefixIn = prefixIn ? prefixIn !== '/' : false;

        const bucketFrom = this.getStorageClient().bucket(bucketIn);
        const bucketTo = bucketIn === bucketOut ? undefined : this.getStorageClient().bucket(bucketOut);

        const copyCalls = [];
        let nextPageToken = '';
        let fileNameTo = '';
        do {
            const files = await bucketFrom.getFiles(
                { maxResults: this.KMaxResults, prefix: prefixIn, pageToken: nextPageToken });
            for (const file of files[0]) {
                fileNameTo = prefixOut ? prefixOut : '';
                fileNameTo = fileNameTo + (rmPrefixIn ? file.name.substr(prefixIn.length) : file.name);
                copyCalls.push(file.copy(bucketTo ? bucketTo.file(fileNameTo) : fileNameTo));
            }
            await Promise.all(copyCalls);
            nextPageToken = files[2].nextPageToken;
        } while (nextPageToken);

    }

    // check if a bucket exist
    public async bucketExists(bucketName: string): Promise<boolean> {
        const result = await this.getStorageClient().bucket(bucketName).exists();
        return result[0];
    }

    public getStorageTiers(): string[] {
        return ['STANDARD', 'NEARLINE', 'COLDLINE', 'ARCHIVE'];
    }

}
