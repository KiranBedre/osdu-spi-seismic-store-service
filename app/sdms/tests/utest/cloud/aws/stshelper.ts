import sinon from "sinon";
import { Tx } from "../../utils";
import { AWSSTShelper } from "../../../../src/cloud/providers/aws/stshelper";
import { Config } from '../../../../src/cloud';
import { AWSConfig } from "../../../../src/cloud/providers/aws";

export class TestAWSStsHelper {
    private static sandbox: sinon.SinonSandbox;
    private static stsHelper: AWSSTShelper;

    public static run() {
        describe(Tx.testInit('AWS STS Helper'), () => {

            beforeEach(() => {
                this.sandbox = sinon.createSandbox();
                this.sandbox.define(AWSConfig, 'AWS_REGION', 'us-west-2');
                this.stsHelper = new AWSSTShelper();
            });

            afterEach(() => {
                this.sandbox.restore();
            });

            this.testGetCredentials();
            this.testPolicy();
        });
    }

    private static testGetCredentials() {
        Tx.sectionInit('Get Credentials');
        const bucket = "TestBucket";
        const keyPath = "TestKeyPath";
        const roleArn = "TestRoleArn";
        const exp = "1000";
        const testCredentials = {
            Credentials: {
                AccessKeyId: "testAccessKeyId",
                // pragma: allowlist nextline secret
                SecretAccessKey: "testSecretAccessKey",
                SessionToken: "testSessionToken"
            }
        }
        
        Tx.test(async () => {
            const flagUpload = true;
            this.sandbox.stub(this.stsHelper, "createUploadPolicy").returns("testPolicy");
            this.sandbox.stub(this.stsHelper['sts'], "send").resolves(testCredentials);
            
            const result = await this.stsHelper.getCredentials(bucket, keyPath, roleArn, flagUpload, exp);
            Tx.checkTrue(result === testCredentials.Credentials.AccessKeyId + ':' + testCredentials.Credentials.SecretAccessKey + ':' + testCredentials.Credentials.SessionToken);
        })

        Tx.test(async () => {
            const flagUpload = false;
            this.sandbox.stub(this.stsHelper, "createDownloadPolicy").returns("testPolicy");
            this.sandbox.stub(this.stsHelper['sts'], "send").resolves(testCredentials);
            
            const result = await this.stsHelper.getCredentials(bucket, keyPath, roleArn, flagUpload, exp);
            Tx.checkTrue(result === testCredentials.Credentials.AccessKeyId + ':' + testCredentials.Credentials.SecretAccessKey + ':' + testCredentials.Credentials.SessionToken);
        })
    }

    private static testPolicy() {
        Tx.sectionInit('Create Upload Policy');
        const bucketName = "TestBucket";
        const keyPath = "TestKeyPath";
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
                    Condition: {
                        StringEquals: {
                            's3:prefix': keyPath+'/'
                        }
                    }
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
                    Condition: {
                        StringLike: {
                            's3:prefix': keyPath+'/*'
                        }
                    }

                },
                {
                    Sid: 'Three',  // Statement 3: Allow Uploading files at the file location
                    Effect: 'Allow',
                    Action: [
                        's3:PutObject',
                        's3:DeleteObject',
                        's3:GetObject',
                        's3:HeadObject',
                        's3:ListObjects',
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
                        's3:HeadObject',
                        's3:ListObjects',
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
                    Condition: {
                        StringEquals: {
                            's3:prefix': keyPath+'/'
                        }
                    }
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
                    Condition: {
                        StringLike: {
                            's3:prefix': keyPath+'/*'
                        }
                    }

                },
                {
                    Sid: 'Three',  // Statement 3: Allow Downloading files at the file location
                    Effect: 'Allow',
                    Action: [
                        's3:GetObject',
                        's3:HeadObject',
                        's3:ListObjects',
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
                        's3:HeadObject',
                        's3:ListObjects',
                        's3:GetObjectVersion'
                    ],
                    Resource: [
                        'arn:aws:s3:::'+bucketName+'/'+keyPath+'/*'
                    ]
                }
            ]
        };

        Tx.test(() => {
            const result = this.stsHelper.createUploadPolicy(bucketName, keyPath);
            Tx.checkTrue(result === JSON.stringify(UploadPolicy));
        })
        Tx.test(() => {
            const result = this.stsHelper.createDownloadPolicy(bucketName, keyPath);
            Tx.checkTrue(result === JSON.stringify(downloadPolicy));
        })
    }
}