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

import sinon from 'sinon';
import {AWSCredentials, AWSDataEcosystemServices } from '../../../../src/cloud/providers/aws'; 
import { DynamoDBClient, GetItemCommand } from "@aws-sdk/client-dynamodb";
import { SecretsManagerClient, GetSecretValueCommand, GetSecretValueCommandOutput } from "@aws-sdk/client-secrets-manager";
import { Tx } from '../../utils'; 
import { AWSSSMhelper } from '../../../../src/cloud/providers/aws/ssmhelper';
import axios from 'axios';
import { Config } from '../../../../src/cloud';
import { AWSConfig } from '../../../../src/cloud/providers/aws';

export class TestAWSCredentials {

    private static sandbox: sinon.SinonSandbox;
    private static awsCredentials: AWSCredentials;
    private static getItemStub;
    private static mockDynamoDB: DynamoDBClient;
    private static mockSecretsManager: SecretsManagerClient;
    private static getSecretValueStub;
  
    public static run() {
          describe(Tx.testInit('AWS Credentials'), () => {

              beforeEach(() => {
                  this.sandbox = sinon.createSandbox();
                  this.sandbox.define(Config, 'CLOUDPROVIDER', 'amazon');
                  this.sandbox.define(AWSConfig, 'AWS_REGION', 'us-west-2');
                  this.sandbox.replace(Config, 'FEATURE_FLAG_LOGGING', false);
                  this.sandbox.replace(Config, 'FEATURE_FLAG_TRACE', false);
                  this.sandbox.replace(Config, 'FEATURE_FLAG_STACKDRIVER_EXPORTER', false);

                  this.getItemStub = this.sandbox.stub().resolves({});
                  this.getSecretValueStub = this.sandbox.stub().resolves({
                    $metadata: {}
                  });

                  // Creating mock DynamoDB client
                  this.mockDynamoDB = {
                    send: async (command) => {
                      if (command instanceof GetItemCommand) return this.getItemStub();
                      return {};
                    }
                  } as unknown as DynamoDBClient;

                  // Creating mock SecretsManager client
                  this.mockSecretsManager = {
                    send: async (command) => {
                      if (command instanceof GetSecretValueCommand) return this.getSecretValueStub();
                      return {};
                    }
                  } as unknown as SecretsManagerClient;

                  this.awsCredentials = new AWSCredentials();
              });

              afterEach(() => { this.sandbox.restore(); });

              this.testGets();
              this.testGetBucketFolder();
              this.testGetStorageCredentials();
              this.testGetServiceCredentials();
              this.testGetSecrets();
          });
      }

    private static testGets() {
      Tx.sectionInit('get methods');

      Tx.test( () => {
        const result = this.awsCredentials.getAudienceForImpCredentials();
        Tx.checkTrue(result === '');
      });

      Tx.test( () => {
        const result = this.awsCredentials.getIAMResourceUrl('test');
        Tx.checkTrue(result === '');
      });

      Tx.test( () => {
        const result = this.awsCredentials.getPublicKeyCertificatesUrl();
        Tx.checkTrue(result === '');
      });

      Tx.test( async () => {
        const result = await this.awsCredentials.getServiceAccountAccessToken();
        Tx.checkTrue(result === undefined);
      });
    }
  
    private static testGetBucketFolder() {
      Tx.sectionInit('getBucketFolder method');
      const folder = "testFolder";
      const tenantId = "testTenantId";

      Tx.test(async () => {
        const mockedReturnValue = {
          Item: {
              gcs_bucket: { S: 'something$$expectedFolder' },
          },
        };
        this.mockDynamoDB.send = async (command) => {
          if (command instanceof GetItemCommand) return mockedReturnValue;
          return {};
        };
        const result = await this.awsCredentials.getBucketFolder(folder, tenantId, this.mockDynamoDB);

        Tx.checkTrue(result === 'expectedFolder');
  
      });

      Tx.test(async () => {
          const mockedReturnValue = {
            Item: {},
        };
        this.mockDynamoDB.send = async (command) => {
          if (command instanceof GetItemCommand) return mockedReturnValue;
          return {};
        };
        const result = await this.awsCredentials.getBucketFolder(folder, tenantId, this.mockDynamoDB);
        Tx.checkTrue(result === undefined);
      });
    }

    private static testGetStorageCredentials() {
      Tx.sectionInit('getStorageCredentials method');

      Tx.test(async () => {
        const tenant = 'testTenant';
        const subproject = 'testSubproject';
        const bucket = 'testBucket';
        const readonly = true;
        const partition = 'testPartition';

        this.sandbox.stub(AWSDataEcosystemServices, 'getTenantIdFromPartitionID').resolves('testTenantId');
        const getSSMParameterStub = this.sandbox.stub(AWSSSMhelper.prototype, 'getSSMParameter');
        getSSMParameterStub.onCall(0).resolves('testS3Bucket');
        getSSMParameterStub.onCall(1).resolves('123');
        getSSMParameterStub.onCall(2).resolves('testRoleArn');
        this.sandbox.stub(this.awsCredentials, 'getBucketFolder').resolves('testFolder');
        this.sandbox.stub((this.awsCredentials as any).awsSTSHelper, 'getCredentials').resolves('testCredentials');
        const result = await this.awsCredentials.getStorageCredentials(tenant, subproject, bucket, readonly, partition);

        const expected = {
          access_token: 'testCredentials',
          expires_in: 123,
          token_type: 'Bearer',
          region: 'us-west-2'
        }
        Tx.checkTrue(JSON.stringify(result) === JSON.stringify(expected));

      });
    }

    private static testGetServiceCredentials() {
      Tx.sectionInit('getServiceCredentials method');

      Tx.test(async () => {

        const getSSMParameterStub = this.sandbox.stub(AWSSSMhelper.prototype, 'getSSMParameter');
        getSSMParameterStub.onCall(0).resolves('idp_name');
        getSSMParameterStub.onCall(1).resolves('client_id');
        getSSMParameterStub.onCall(2).resolves('token_url');
        getSSMParameterStub.onCall(3).resolves('oauth_scope');
        this.sandbox.stub(AWSCredentials, 'getSecrets').resolves('testSecrets');
        const mockResponse = {
          data: {
            access_token: 'mockAccessToken',
            expires_in: +'3600', 
            token_type: 'Bearer',
          }
          
      };

        this.sandbox.stub(axios, 'post').resolves(mockResponse);

        const result = await AWSCredentials.getServiceCredentials();
        
        (AWSCredentials as any).servicePrincipalCredential = mockResponse.data;
        Tx.checkTrue(result === 'mockAccessToken');
      });
    }

    private static testGetSecrets() {
      Tx.sectionInit('getSecrets method');

      const testName = 'testClientSecretName';
      const testKey = 'testClientSecretDictKey';

      Tx.test(async () => {
        const mockVal: GetSecretValueCommandOutput = {
          SecretString: `{"${testKey}": "your_secret_value"}`,
          $metadata: {}
        };
        
        this.mockSecretsManager.send = async (command) => {
          if (command instanceof GetSecretValueCommand) return mockVal;
          return {};
        };
        
        const result = await AWSCredentials.getSecrets(testName, testKey, this.mockSecretsManager);
        Tx.checkTrue(result === 'your_secret_value');
      });

      Tx.test(async () => {
        const binaryData = Buffer.from('base64_encoded_binary_secret_value').toString('base64');
        const mockVal: GetSecretValueCommandOutput = {
          SecretString: null,
          SecretBinary: Buffer.from(binaryData, 'base64'),
          $metadata: {}
        };
        
        this.mockSecretsManager.send = async (command) => {
          if (command instanceof GetSecretValueCommand) return mockVal;
          return {};
        };
        
        const result = await AWSCredentials.getSecrets(testName, testKey, this.mockSecretsManager);
        const expectedBinary = Buffer.from('base64_encoded_binary_secret_value', 'base64').toString('ascii');
        Tx.checkTrue(result === expectedBinary);
      });

      Tx.test(async () => {
        this.mockSecretsManager.send = async (command) => {
          if (command instanceof GetSecretValueCommand) throw new Error('test error');
          return {};
        };
      
        try {
          await AWSCredentials.getSecrets(testName, testKey, this.mockSecretsManager);
        } catch (err) {
          Tx.checkTrue(err.message === 'test error');
        }
      });
    }
  }