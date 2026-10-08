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

import { IbmConfig } from './config';
import {STS} from 'aws-sdk';

// [TODO] don't use any! use types
export class IBMSTShelper{

    private sts: STS;

    public constructor() {
        this.sts = new STS({apiVersion: '2014-11-06',
                            endpoint: IbmConfig.COS_ENDPOINT,
                            accessKeyId: IbmConfig.COS_SUBUSER_ACCESS_KEY_ID,
                            secretAccessKey: IbmConfig.COS_SUBUSER_SECRET_ACCESS_KEY,
                            region: 'us-south',});
    }

    public async getCredentials(bucketName: string, keyPath: string,
        roleArn: string, roleSessionName: string, flagUpload: boolean, exp: string): Promise<string> {
        let policy: any;

        if(flagUpload === true)
             policy = this.createUploadPolicy(bucketName, keyPath);
        else
            policy = this.createDownloadPolicy(bucketName, keyPath);

         // hardcoded policy
         // policy= '{"Version":"2012-10-17","Statement":
         // [{"Sid":"Stmt1","Effect":"Allow","Action":"s3:*","Resource":"arn:aws:s3:::*"}]}'  ;
        const expDuration: number = +exp;

        const stsParams = {
            ExternalId: 'OSDUAWS',
            Policy: policy,
            RoleArn: roleArn,
            RoleSessionName: roleSessionName,
            DurationSeconds: expDuration
        };
        const roleCredentials =  await this.sts.assumeRole(stsParams).promise();
        const tempCredentials= roleCredentials.Credentials.AccessKeyId +
            ':' + roleCredentials.Credentials.SecretAccessKey +
            ':' + roleCredentials.Credentials.SessionToken;

      return tempCredentials;
    }

    public  createUploadPolicy(bucketName: string, keyPath: string): string {

        const UploadPolicy = {
            Version: '2012-10-17',
            Statement: [
                {
                    Sid: 'One',     // Statement 1: Allow Listing files at the file location
                    Effect: 'Allow',
                    Action: [
                        's3:ListBucket'
                    ],
                    Resource: [
                        'arn:aws:s3:::'+bucketName
                    ]
                },
                {
                    Sid: 'Two', // Statement 2: Allow Listing files under the file location
                    Effect: 'Allow',
                    Action: [
                        's3:*'
                    ],
                    Resource: [
                        'arn:aws:s3:::'+bucketName
                    ]

                },
                {
                    Sid: 'Three',  // Statement 3: Allow Uploading files at the file location
                    Effect: 'Allow',
                    Action: [
                        's3:PutObject',
                        's3:DeleteObject',
                        's3:GetObject',
                        's3:ListBucketMultipartUploads',
                        's3:AbortMultipartUpload',
                        's3:ListMultipartUploadParts'
                    ],
                    Resource: [
                        'arn:aws:s3:::'+bucketName
                    ]
                },
                {
                    Sid: 'Four',   // Statement 4: Allow Uploading files under the file location
                    Effect: 'Allow',
                    Action: [
                        's3:PutObject',
                        's3:DeleteObject',
                        's3:GetObject',
                        's3:ListBucketMultipartUploads',
                        's3:AbortMultipartUpload',
                        's3:ListMultipartUploadParts'
                    ],
                    Resource: [
                        'arn:aws:s3:::'+bucketName+'/*'
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
                        's3:ListBucket'
                    ],
                    Resource: [
                        'arn:aws:s3:::'+bucketName
                    ]
                },
                {
                    Sid: 'Two', // Statement 2: Allow Listing files under the file location
                    Effect: 'Allow',
                    Action: [
                        's3:*'
                    ],
                    Resource: [
                        'arn:aws:s3:::'+bucketName
                    ]

                },
                {
                    Sid: 'Three',  // Statement 3: Allow Downloading files at the file location
                    Effect: 'Allow',
                    Action: [
                        's3:GetObject'
                    ],
                    Resource: [
                        'arn:aws:s3:::'+bucketName
                    ]
                },
                {
                    Sid: 'Four',   // Statement 4: Allow Downloading files under the file location
                    Effect: 'Allow',
                    Action: [
                        's3:GetObject'
                    ],
                    Resource: [
                        'arn:aws:s3:::'+bucketName+'/*'
                    ]
                }
            ]
        };

        const policy = JSON.stringify(downloadPolicy);
        return policy;
    }

}
