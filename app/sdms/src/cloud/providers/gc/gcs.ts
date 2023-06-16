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


import { Storage, Bucket } from '@google-cloud/storage';
import { TenantModel } from '../../../services/tenant';
import { Config } from '../../config';
import { KEEP_FILE_NAME, GCS_URL_SEPARATOR } from './constants'
import { LoggerFactory } from '../../logger';
import { AbstractStorage, StorageFactory } from '../../storage';
import { ConfigGoogle } from './config';
import { v4 as uuidv4 } from 'uuid';
import { join as path_join } from 'path';


export class SubProjectPath {
    public dataPartitionId?: string
    public subprojectFolder?: string
    // TODO: delete this, as it is old implementation with creating a new bucket for a new subproject
    public bucketname: string

    private static storageClientCache: { [key: string]: Storage } = {};
    private static bucketCache: { [key: string]: Storage } = {};


    /**
     * Construct a new struct with path to the subproject
     * @param {string} bucketname - usually, it's a bucketname parameter in AbstractStorage methods
     */
    private constructor(
        bucketname: string,
        subprojectFolder?: string,
        dataPartitionId?: string
    ) {
        this.bucketname = bucketname;
        this.subprojectFolder = subprojectFolder;
        this.dataPartitionId = dataPartitionId;
    }

    /**
     * Create a new subproject path object.
     * The subproject path could point either to the separate google storage bucket
     * or to the separate folder in the bucket got form Partition service by dataPartitionId
     * If the last option is chosen than the path should look like "<bucketName>$$<subprojectFolderName>".
     * @param gcs_path
     * @returns
     */
    public static async create(gcsPath: string): Promise<SubProjectPath> {
        if (!gcsPath.includes(GCS_URL_SEPARATOR)) {
            const bucketname = gcsPath;
            return new SubProjectPath(bucketname, '', '');
        } else {
            const splittedBucketName = gcsPath.split(GCS_URL_SEPARATOR);
            const bucketName = splittedBucketName[0];
            const subprojectFolder = splittedBucketName[1];
            // const bucketname = await SubProjectPath.getBucketNameFromPartitionService(dataPartitionId);
            return new SubProjectPath(bucketName, subprojectFolder);
        }
    }

    private static async getBucketNameFromPartitionService(dataPartitionId: string) {
        // TODO: implement Partition Service call
        return ConfigGoogle.GCS_BUCKET
    }
}

@StorageFactory.register('gc')
export class GCS extends AbstractStorage {
    private KMaxResults = 100;
    private dataPartitionId: string;

    private static clientsCache: { [key: string]: Storage; } = {};
    private static dataPartitionCache: { [key: string]: Storage; } = {};

    public constructor(tenant: TenantModel) {
        super();
        this.dataPartitionId = tenant?.gcpid;
    }

    private async getSubprojectPath(gcsPath: string): Promise<SubProjectPath> {
        const subprojectPath = await SubProjectPath.create(gcsPath);
        return subprojectPath;
    }

    private getStorageClient(): Storage {
        if (GCS.clientsCache[this.dataPartitionId] === undefined) {
            GCS.clientsCache[this.dataPartitionId] = new Storage();
        }
        return GCS.clientsCache[this.dataPartitionId];
    }

    // generate a folder name that is considered a random bucket name
    // It has the following structure
    public async randomBucketName(): Promise<string> {
        /**
         * Return a new subproject path with the following structure <bucketName>$$<subprojectFolderName>/
         * We use the data-partition-id to acquire the information about the bucker from Partition service
         */
        const randomFolderName = uuidv4();

        return ConfigGoogle.GCS_BUCKET + GCS_URL_SEPARATOR + randomFolderName;
    }

    // Create a new folder for the subproject, not a bucket.
    // Create an empty blob with a <subproject folder>/<random name> to reserve the subproject's folder
    public async createBucket(subprojectURI: string, location: string, storageClass: string): Promise<void> {
        const subprojectPath = await this.getSubprojectPath(subprojectURI);
        const bucket = this.getStorageClient().bucket(subprojectPath.bucketname);
        const newSubprojectFolderDummyObj = path_join(subprojectPath.subprojectFolder, KEEP_FILE_NAME);
        await bucket.file(newSubprojectFolderDummyObj).save('');
    }

    // Delete a bucket
    // in our case we consider a bucket to be a folder
    public async deleteBucket(subprojectURI: string, force = false): Promise<void> {
        const subprojectPath = await this.getSubprojectPath(subprojectURI);
        const bucket = this.getStorageClient().bucket(subprojectPath.bucketname);
        await bucket.deleteFiles({ prefix: subprojectPath.subprojectFolder + '/' });
    }

    // Delete all files in a subproject
    public async deleteFiles(subprojectURI: string): Promise<void> {
        const subprojectPath = await this.getSubprojectPath(subprojectURI);
        const bucket = this.getStorageClient().bucket(subprojectPath.bucketname);
        await bucket.deleteFiles({ prefix: subprojectPath.subprojectFolder + '/', });
        const subprojectFolderDummyObj = path_join(subprojectPath.subprojectFolder, KEEP_FILE_NAME);
        await bucket.file(subprojectFolderDummyObj).save(''); // add the dummy file back to reserve subproject's folder
    }

    // save an object/file to a bucket
    public async saveObject(subprojectURI: string, datasetFolder: string, data: string): Promise<void> {
        // Create and save the file
        const subprojectPath = await this.getSubprojectPath(subprojectURI);
        const bucket = this.getStorageClient().bucket(subprojectPath.bucketname);
        await bucket.file(subprojectPath.subprojectFolder + '/' + datasetFolder).save(data);
    }

    /**
     * Delete a dataset's subfolder from the bucket;
     *
     * @param subprojectURI: "<bucketName>$$<subprojectFolderName>"
     * @param datasetFolder: The dataset's subfolder
     */
    public async deleteObjects(subprojectURI: string, datasetFolder: string): Promise<void> {
        const subprojectPath = await this.getSubprojectPath(subprojectURI);
        const bucket = this.getStorageClient().bucket(subprojectPath.bucketname);
        const datasetObjectsPath = path_join(subprojectPath.subprojectFolder, datasetFolder, '/');

        const deleteQuery = { prefix: datasetObjectsPath, force: true };
        // tslint:disable-next-line: no-floating-promises
        await bucket.deleteFiles(deleteQuery).catch(
            // tslint:disable-next-line: no-console
            (error) => { LoggerFactory.build(Config.CLOUDPROVIDER).error(JSON.stringify(error)); });
    }

    // copy multiple objects (skip the dummy file)
    public async copy(
        subprojectURIFrom: string,
        datasetFolderFrom: string,
        subprojectURITo: string,
        datasetFolderTo: string,
        ownerEmail: string
    ) {

        const subprojectPathFrom = await this.getSubprojectPath(subprojectURIFrom);
        const subprojectPathTo = await this.getSubprojectPath(subprojectURITo);
        const bucketFrom = this.getStorageClient().bucket(subprojectPathFrom.bucketname);
        const bucketTo = this.getStorageClient().bucket(subprojectPathTo.bucketname);
        datasetFolderFrom = path_join(subprojectPathFrom.subprojectFolder, datasetFolderFrom);
        datasetFolderTo = path_join(subprojectPathFrom.subprojectFolder, datasetFolderTo);

        const rmDatasetFolderFrom = datasetFolderFrom ? datasetFolderFrom !== '/' : false;

        const copyCalls = [];
        let nextPageToken = '';
        let fileNameTo = '';
        do {
            const files = await bucketFrom.getFiles(
                { maxResults: this.KMaxResults, prefix: datasetFolderFrom, pageToken: nextPageToken });
            for (const file of files[0]) {
                fileNameTo = datasetFolderTo ? datasetFolderTo : '';
                fileNameTo = fileNameTo + (
                    rmDatasetFolderFrom ? file.name.substr(datasetFolderFrom.length) : file.name);
                copyCalls.push(file.copy(bucketTo ? bucketTo.file(fileNameTo) : fileNameTo));
            }
            await Promise.all(copyCalls);
            nextPageToken = files[2].nextPageToken;
        } while (nextPageToken);

    }

    // check if a bucket exist
    public async bucketExists(subprojectURI: string): Promise<boolean> {
        const subprojectPath = await this.getSubprojectPath(subprojectURI);
        const bucket = this.getStorageClient().bucket(subprojectPath.bucketname);
        try {
            const doesExist = await bucket.file(
                path_join('subprojectPath.subprojectFolder', KEEP_FILE_NAME)
            ).exists()[0];
            return doesExist;
        } catch (error) {
            return false;
        }

    }

    public getStorageTiers(): string[] {
        return ['STANDARD', 'NEARLINE', 'COLDLINE', 'ARCHIVE'];
    }

}
