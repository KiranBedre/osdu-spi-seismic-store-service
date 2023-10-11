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
import { STS, AssumeRoleCommand } from '@aws-sdk/client-sts';

export class AWSSTShelper {
    private sts: STS;

    public constructor() {
        this.sts = new STS({
            region: AWSConfig.AWS_REGION,
            apiVersion: '2011-11-06',
        });
    }

    public async getCredentials(
        bucketName: string,
        keyPath: string,
        roleArn: string,
        flagUpload: boolean,
        exp: string
    ): Promise<string> {
        let policy: string;

        if (flagUpload === true) policy = this.createUploadPolicy(bucketName, keyPath);
        else policy = this.createDownloadPolicy(bucketName, keyPath);

        const expDuration: number = +exp;

        const stsParams = {
            ExternalId: 'OSDUAWS',
            Policy: policy,
            RoleArn: roleArn,
            RoleSessionName: 'OSDUAWSAssumeRoleSession',
            DurationSeconds: expDuration,
        };
        const command = new AssumeRoleCommand(stsParams);
        const roleCredentials = await this.sts.send(command);

        const tempCredentials =
            roleCredentials.Credentials.AccessKeyId +
            ':' +
            roleCredentials.Credentials.SecretAccessKey +
            ':' +
            roleCredentials.Credentials.SessionToken;

        return tempCredentials;
    }

    public createUploadPolicy(bucketName: string, keyPath: string): string {
        const UploadPolicy = {
            Version: '2012-10-17',
            Statement: [
                {
                    Sid: 'One', // Statement 1: Allow Listing files at the file location
                    Effect: 'Allow',
                    Action: ['s3:ListBucketVersions', 's3:ListBucket'],
                    Resource: ['arn:aws:s3:::' + bucketName],
                    Condition: {
                        StringEquals: {
                            's3:prefix': keyPath + '/',
                        },
                    },
                },
                {
                    Sid: 'Two', // Statement 2: Allow Listing files under the file location
                    Effect: 'Allow',
                    Action: ['s3:*'],
                    Resource: ['arn:aws:s3:::' + bucketName],
                    Condition: {
                        StringLike: {
                            's3:prefix': keyPath + '/*',
                        },
                    },
                },
                {
                    Sid: 'Three', // Statement 3: Allow Uploading files at the file location
                    Effect: 'Allow',
                    Action: [
                        's3:PutObject',
                        's3:DeleteObject',
                        's3:GetObject',
                        's3:HeadObject',
                        's3:ListObjects',
                        's3:ListBucketMultipartUploads',
                        's3:AbortMultipartUpload',
                        's3:ListMultipartUploadParts',
                    ],
                    Resource: ['arn:aws:s3:::' + bucketName + '/' + keyPath + '/'],
                },
                {
                    Sid: 'Four', // Statement 4: Allow Uploading files under the file location
                    Effect: 'Allow',
                    Action: [
                        's3:PutObject',
                        's3:DeleteObject',
                        's3:GetObject',
                        's3:HeadObject',
                        's3:ListObjects',
                        's3:ListBucketMultipartUploads',
                        's3:AbortMultipartUpload',
                        's3:ListMultipartUploadParts',
                    ],
                    Resource: ['arn:aws:s3:::' + bucketName + '/' + keyPath + '/*'],
                },
            ],
        };

        const policy = JSON.stringify(UploadPolicy);
        return policy;
    }

    public createDownloadPolicy(bucketName: string, keyPath: string): string {
        const downloadPolicy = {
            Version: '2012-10-17',
            Statement: [
                {
                    Sid: 'One', // Statement 1: Allow Listing files at the file location
                    Effect: 'Allow',
                    Action: ['s3:ListBucketVersions', 's3:ListBucket'],
                    Resource: ['arn:aws:s3:::' + bucketName],
                    Condition: {
                        StringEquals: {
                            's3:prefix': keyPath + '/',
                        },
                    },
                },
                {
                    Sid: 'Two', // Statement 2: Allow Listing files under the file location
                    Effect: 'Allow',
                    Action: ['s3:*'],
                    Resource: ['arn:aws:s3:::' + bucketName],
                    Condition: {
                        StringLike: {
                            's3:prefix': keyPath + '/*',
                        },
                    },
                },
                {
                    Sid: 'Three', // Statement 3: Allow Downloading files at the file location
                    Effect: 'Allow',
                    Action: ['s3:GetObject', 's3:HeadObject', 's3:ListObjects', 's3:GetObjectVersion'],
                    Resource: ['arn:aws:s3:::' + bucketName + '/' + keyPath + '/'],
                },
                {
                    Sid: 'Four', // Statement 4: Allow Downloading files under the file location
                    Effect: 'Allow',
                    Action: ['s3:GetObject', 's3:HeadObject', 's3:ListObjects', 's3:GetObjectVersion'],
                    Resource: ['arn:aws:s3:::' + bucketName + '/' + keyPath + '/*'],
                },
            ],
        };

        const policy = JSON.stringify(downloadPolicy);
        return policy;
    }
}
