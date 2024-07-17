// Copyright 2022 Google LLC
// Copyright 2022 EPAM Systems
//
// Licensed under the Apache License, Version 2.0 (the 'License');
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an 'AS IS' BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.


import {
    CopyObjectCommand,
    DeleteObjectCommand,
    DeleteObjectsCommand,
    ListObjectsCommand,
    PutObjectCommand,
    S3Client
} from '@aws-sdk/client-s3'

import { TenantModel } from '../../../services/tenant';
import { AbstractStorage, StorageFactory } from '../../storage';
import { AnthosConfig } from './config';
import { AnthosCredentials } from './credentials';
import { PartitionInfo } from './utils';
import { AnthosLogger } from './logger';

const logger = new AnthosLogger();


@StorageFactory.register('anthos')
export class MinIOStorage extends AbstractStorage {

    private s3: S3Client;
    private tenant: TenantModel
    private minioBucket: string;

    public constructor(tenant: TenantModel) {
        super();
        this.tenant = tenant;
        this.minioBucket = '';
        this.s3 = new S3Client(
            {
                // TODO: Replace this with PArtitionInfo API call later
                credentials: {
                    accessKeyId: AnthosConfig.MINIO_ACCESS_KEY,
                    secretAccessKey: AnthosConfig.MINIO_SECRET_KEY,
                },
                endpoint: AnthosConfig.MINIO_ENDPOINT,
                forcePathStyle: true,
                region: 'us-east-1'
            }
        );
    }

    /* We can't move S3 client creation to constructor,
       because call to Partition API is async and we can't use awaitables in constructor.
    */
    private async initS3Client() {
        if (this.s3 === undefined) {
            const partitionInfo: PartitionInfo = await AnthosCredentials.getPartitionInfo(this.tenant.gcpid);
            this.s3 = new S3Client(
                {
                    // TODO: Replace this with PArtitionInfo API call later
                    credentials: {
                        accessKeyId: partitionInfo.accessKey,
                        secretAccessKey: partitionInfo.secretKey,
                    },
                    endpoint: partitionInfo.endpoint,
                    forcePathStyle: true,
                }
            );
        }
    }

    private async getBucket() {
        if (this.minioBucket === '') {
            this.minioBucket = AnthosConfig.SDMS_BUCKET;
        }
    }

    /*
    Have to copy-paste the same code as in AWSStorage, because it is impossible to inherit
    from that class without calling its constructor.

    TODO: Write common super class for AWSStorage and MinIO storage
    */
    private fixFolderFormat(folder: string): string {
        if (folder) {
            folder += '/';
            while (folder.indexOf('//') !== -1) {
                folder = folder.replace('//', '/');
            }
        }
        return folder;
    }

    // generate a random bucket name, for minIO, a random folder name
    public async randomBucketName(): Promise<string> {
        // await this.initS3Client();
        await this.getBucket();
        let suffix = Math.random().toString(36).substring(2, 16);
        suffix = suffix + Math.random().toString(36).substring(2, 16);
        suffix = suffix.substr(0, 16);
        return this.minioBucket + '$$' + suffix;
    }

    // whenever ask for a bucket, we return bucketName$$folderName for that subproject
    // this function return the real folderName by remove bucketName$$ at the front of folderName
    public getFolder(folderName: string): string {
        const start = this.minioBucket.length + 2;
        const str = folderName.substr(start);
        return str;
    }

    // Create a new bucket, for minIO, create a folder with folderName
    public async createBucket(
        folderName: string,
        location: string, storageClass: string): Promise<void> {
        // await this.initS3Client();
        await this.getBucket();
        const folder = this.getFolder(folderName);
        const command = new PutObjectCommand(
            {
                Bucket: this.minioBucket,
                Body: '',
                Key: folder + '/'
            }
        );

        try {
            await this.s3.send(command);
        } catch (err) {
            logger.error('Can\'t create Seismic subproject bucket');
            logger.error(err.code + ': ' + err.message);
            throw err;
        }
    }

    // Delete a bucket, for minIO, delete folder folderName
    public async deleteBucket(folderName: string, force = false): Promise<void> {
        // await this.initS3Client();
        await this.getBucket();

        if (force) {
            await this.deleteFiles(folderName);
        }
        const folder = this.getFolder(folderName);
        const command = new DeleteObjectCommand(
            {
                Bucket: this.minioBucket,
                Key: folder + '/'
            }
        );
        try {
            await this.s3.send(command);
        } catch (err) {
            logger.error('Can\'t delete subproject bucket');
            logger.error(err.code + ': ' + err.message);
            throw err;
        }
    }

    // Delete all files in a bucket, for minIO, delete all files in the folder
    public async deleteFiles(folderName: string): Promise<void> {
        // await this.initS3Client();
        await this.getBucket();
        const folder = this.getFolder(folderName);

        try {
            const listCommand = new ListObjectsCommand(
                {
                    Bucket: this.minioBucket,
                    Prefix: folder + '/'
                }
            );
            const listedObjects = await this.s3.send(listCommand);
            if (typeof(listedObjects.Contents) === 'undefined' || listedObjects.Contents.length === 0)
                return;

            const deleteParams = {
                Bucket: this.minioBucket,
                Delete: { Objects: [] }
            };

            listedObjects.Contents.forEach(({ Key }) => {
                deleteParams.Delete.Objects.push({ Key });
            });

            const deleteCommand = new DeleteObjectsCommand(deleteParams);
            await this.s3.send(deleteCommand);

            if (listedObjects.IsTruncated)  // continue delete files as there are more...
                await this.deleteFiles(folderName);

        } catch (err) {
            logger.error('Can\'t delete files');
            logger.error(err.code + ': ' + err.message);
            throw err;
        }
    }

    // save an object/file to a bucket
    public async saveObject(folderName: string, objectName: string, data: string): Promise<void> {
        // await this.initS3Client();
        await this.getBucket();
        const folder = this.getFolder(folderName);
        const params = {
            Bucket: this.minioBucket,
            Key: folder + '/' + objectName,
            Body: data
        };
        const command = new PutObjectCommand(params);

        try {
            await this.s3.send(command);
        } catch (err) {
            logger.error('Can\'t save new object');
            logger.error(err.code + ': ' + err.message);
            throw err;
        }
    }

    // delete an object from a bucket
    public async deleteObject(folderName: string, objectName: string): Promise<void> {
        // await this.initS3Client();
        await this.getBucket();
        const folder = this.getFolder(folderName);
        const params = {
            Bucket: this.minioBucket,
            Key: folder + '/' + objectName
        };
        const command = new DeleteObjectCommand(params);
        try {
            await this.s3.send(command);
        } catch (err) {
            logger.info('Can\'t delete a single object');
            logger.error(err.code + ': ' + err.message);
            throw err;
        }
    }

    // delete multiple objects
    public async deleteObjects(folderName: string, prefix: string, async: boolean = false): Promise<void> {
        // await this.initS3Client();
        await this.getBucket();
        const folder = this.getFolder(folderName);
        try {
            const params = {
                Bucket: this.minioBucket,
                Prefix: folder + '/' + prefix
            };
            const listCommand = new ListObjectsCommand(params);
            const listedObjects = await this.s3.send(listCommand);

            if (typeof(listedObjects.Contents) === 'undefined' || listedObjects.Contents.length === 0)
                return;

            const deleteParams = {
                Bucket: this.minioBucket,
                Delete: { Objects: [] }
            };

            listedObjects.Contents.forEach(({ Key }) => {
                deleteParams.Delete.Objects.push({ Key });
            });

            const deleteCommand = new DeleteObjectsCommand(deleteParams);

            await this.s3.send(deleteCommand);

            if (listedObjects.IsTruncated) // continue delete files as there are more...
                await this.deleteObjects(folderName, prefix);

        } catch (err) {
            logger.error('Can\'t delete objects');
            logger.error(err.code + ': ' + err.message);
            throw err;
        }
    }

    // copy multiple objects (skip the dummy file)
    public async copy(folderIn: string, prefixIn: string, folderOut: string, prefixOut: string, ownerEmail: string) {
        // await this.initS3Client();
        await this.getBucket();
        prefixIn = this.fixFolderFormat(prefixIn);
        prefixOut = this.fixFolderFormat(prefixOut);

        const realFolderIn = this.getFolder(folderIn);
        const realFolderOut = this.getFolder(folderOut);

        const copyCalls = [];
        const params = {
            Bucket: this.minioBucket,
            Prefix: realFolderIn + '/' + prefixIn
        };

        try {
            const listCommand = new ListObjectsCommand(params);
            const files = await this.s3.send(listCommand);

            for (const file of files['Contents']) {
                let newKey = file.Key.replace(realFolderIn, realFolderOut);
                newKey = newKey.replace(folderIn, prefixOut);
                const param = {
                    Bucket: this.minioBucket,
                    CopySource: file.Key,
                    Key: newKey
                };
                const copyCommand = new CopyObjectCommand(param);
                copyCalls.push(this.s3.send(copyCommand));
            }
            await Promise.all(copyCalls);

        } catch (err) {
            logger.error('Can\'t copy objects');
            logger.error(err.code + ': ' + err.message);
            throw err;
        }
    }

    // check if a bucket exist, for minIO, check if folder in the bucket
    // folderName is a string without / at the end
    public async bucketExists(folderName: string): Promise<boolean> {
        // await this.initS3Client();
        await this.getBucket();
        const folder = this.getFolder(folderName);
        const params = {
            Bucket: this.minioBucket,
            Prefix: folder
        };

        try {
            const listCommand = new ListObjectsCommand(params);
            const listedObjects = await this.s3.send(listCommand);
            if (typeof(listedObjects.Contents) === 'undefined' || listedObjects.Contents.length === 0)
                return false;
            return true;
        } catch (err) {
            logger.error('Can\'t list objects');
            logger.error(err.code + ': ' + err.message);
            throw err;
        }
    }
}
