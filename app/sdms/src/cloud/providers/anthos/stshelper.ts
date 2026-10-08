// Copyright 2022 Google LLC
// Copyright 2022 EPAM Systems
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

import { AssumeRoleCommand, STSClient } from '@aws-sdk/client-sts';

import { PartitionInfo } from './utils';
import { AnthosLogger } from './logger';

const logger = new AnthosLogger();

export class MinIOSTShelper {

    private sts: STSClient;

    public constructor(partitionInfo: PartitionInfo) {
        logger.info('Endpoint: ' + partitionInfo.endpoint);
        this.sts = new STSClient(
            {
                credentials: {
                    accessKeyId: partitionInfo.accessKey,
                    secretAccessKey: partitionInfo.secretKey,
                },
                endpoint: partitionInfo.endpoint,
                apiVersion: '2011-06-15',
                region: 'us-east-1'
            }
        );
    }

    public async getCredentials(bucketName: string, keyPath: string,
        roleArn: string, flagUpload: boolean, exp: string): Promise<string> {
        let policy: string;

        if(flagUpload === true)
            policy = this.createUploadPolicy(bucketName, keyPath);
        else
            policy = this.createDownloadPolicy(bucketName, keyPath);

        const expDuration: number = +exp;
        const stsParams = {
            Policy: policy,
            RoleArn: roleArn,
            RoleSessionName: 'ignored-by-minio',
            DurationSeconds: expDuration
        };

        logger.debug('STSParams ' + stsParams);
        logger.debug(stsParams.Policy);

        const assumeRoleCommand = new AssumeRoleCommand(stsParams);
        try{
            const roleCredentials =  await this.sts.send(assumeRoleCommand);
            const tempCredentials = roleCredentials.Credentials.AccessKeyId +
            ':' + roleCredentials.Credentials.SecretAccessKey +
            ':' + roleCredentials.Credentials.SessionToken;
            return tempCredentials;
        }catch(e){
            logger.error(e);
            throw e;
        }
    }

    public  createUploadPolicy(bucketName: string, keyPath: string): string {

        const UploadPolicy = {
            Version: '2012-10-17',
            Statement: [
                {
                    Sid: 'One',     // Statement 1: Allow Listing files at the file location
                    Effect: 'Allow',
                    Action: [
                        's3:ListBucketVersions',
                        's3:ListBucket'
                    ],
                    Resource: [
                        'arn:aws:s3:::'+bucketName
                    ],
                    Condition: { StringEquals: { 's3:prefix': keyPath+'/' } }
                },
                {
                    Sid: 'Two', // Statement 2: Allow Listing files under the file location
                    Effect: 'Allow',
                    Action: [
                        's3:*'
                    ],
                    Resource: [
                        'arn:aws:s3:::'+bucketName
                    ],
                    Condition: { StringLike: { 's3:prefix': keyPath+'/*' } }

                },
                {
                    Sid: 'Three',  // Statement 3: Allow Uploading files at the file location
                    Effect: 'Allow',
                    Action: [
                        's3:PutObject',
                        's3:DeleteObject',
                        's3:GetObject',
                        's3:ListBucket',
                        's3:ListBucketMultipartUploads',
                        's3:AbortMultipartUpload',
                        's3:ListMultipartUploadParts'
                    ],
                    Resource: [
                        'arn:aws:s3:::'+bucketName+'/'+keyPath+'/'
                    ]
                },
                {
                    Sid: 'Four',   // Statement 4: Allow Uploading files under the file location
                    Effect: 'Allow',
                    Action: [
                        's3:PutObject',
                        's3:DeleteObject',
                        's3:GetObject',
                        's3:ListBucket',
                        's3:ListBucketMultipartUploads',
                        's3:AbortMultipartUpload',
                        's3:ListMultipartUploadParts'
                    ],
                    Resource: [
                        'arn:aws:s3:::'+bucketName+'/'+keyPath+'/*'
                    ]
                }
            ]
        };


        const policy = JSON.stringify(UploadPolicy);
        return policy;
    }

    public  createDownloadPolicy(bucketName: string, keyPath: string): string {

        const downloadPolicy = {
            Version: '2012-10-17',
            Statement: [
                {
                    Sid: 'One',     // Statement 1: Allow Listing files at the file location
                    Effect: 'Allow',
                    Action: [
                        's3:ListBucketVersions',
                        's3:ListBucket'
                    ],
                    Resource: [
                        'arn:aws:s3:::'+bucketName
                    ],
                    Condition: { StringEquals: { 's3:prefix': keyPath+'/' } }
                },
                {
                    Sid: 'Two', // Statement 2: Allow Listing files under the file location
                    Effect: 'Allow',
                    Action: [
                        's3:ListBucket'
                    ],
                    Resource: [
                        'arn:aws:s3:::'+bucketName
                    ],
                    Condition: { StringLike: { 's3:prefix': keyPath+'/*' } }

                },
                {
                    Sid: 'Three',  // Statement 3: Allow Downloading files at the file location
                    Effect: 'Allow',
                    Action: [
                        's3:GetObject',
                        's3:ListBucket',
                        's3:GetObjectVersion'
                    ],
                    Resource: [
                        'arn:aws:s3:::'+bucketName+'/'+keyPath+'/'
                    ]
                },
                {
                    Sid: 'Four',   // Statement 4: Allow Downloading files under the file location
                    Effect: 'Allow',
                    Action: [
                        's3:GetObject',
                        's3:ListBucket',
                        's3:GetObjectVersion'
                    ],
                    Resource: [
                        'arn:aws:s3:::'+bucketName+'/'+keyPath+'/*'
                    ]
                }
            ]
        };


        const policy = JSON.stringify(downloadPolicy);
        return policy;
    }

}
