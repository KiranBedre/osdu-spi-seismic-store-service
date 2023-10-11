// Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
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

import { AWSConfig } from './config';
import { AbstractStorage, StorageFactory } from '../../storage';
import { S3, 
    HeadObjectCommand, HeadObjectCommandInput, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { AwsSecrets } from './secrets';

// Aws implementation
// each tenant has one S3 bucket, from dataPartition, we call partition service to get tenant info
// use ssm with tenant to get S3 bucket name
@StorageFactory.register('aws')
export class AWSStorage extends AbstractStorage {
    private s3: S3; // S3 service object
    private awsBucket: string;
    private dataPartition: string;

    constructor(args: any) {
        super();
        this.s3 = new S3({
            region: AWSConfig.AWS_REGION,
            apiVersion: '2006-03-01'
        });
        this.dataPartition = args.dataPartition;
        this.awsBucket = '';
    }
    private async getBucket() {
        if (this.awsBucket === '') {
            this.awsBucket = await AwsSecrets.getBucketFromPartitionID(this.dataPartition);
        }
    }

    // Create a new bucket, bucketName is object name
    public async createBucket(bucketName: string): Promise<void> {
        await this.getBucket();
        const params = {
            Bucket: this.awsBucket,
            Key: this.dataPartition+'/'+bucketName + '/',
            Body: '',
        };
        try {
            const command = new PutObjectCommand(params);
            await this.s3.send(command);
        } catch (err) {
            // tslint:disable-next-line:no-console
            console.log(err.code + ': ' + err.message);
        }
    }

    // Delete a bucket, for aws, delete objectName
    public async deleteBucket(bucketName: string): Promise<void> {
        await this.getBucket();

        const object = this.dataPartition+'/'+bucketName;
        const params = {
            Bucket: this.awsBucket,
            Key: object + '/',
        };
        try {
            const command = new DeleteObjectCommand(params);
            await this.s3.send(command);
        } catch (err) {
            // tslint:disable-next-line:no-console
            console.log(err.code + ': ' + err.message);
        }
    }
    // check if a bucket exist, for aws, check if folder in the bucket
    // folderName is a string without / at the end
    public async bucketExists(bucketName: string): Promise<boolean> {
        await this.getBucket();
        const folder = this.dataPartition+'/'+bucketName;
        const params : HeadObjectCommandInput = {
            Bucket: this.awsBucket,
            Key: folder,
        };
        const command = new HeadObjectCommand(params);

        try {
            const data = await this.s3.send(command);
            const exists = data.$metadata.httpStatusCode === 200;
            return exists;
        } catch (error) {
            return false;
        }
    }
}
