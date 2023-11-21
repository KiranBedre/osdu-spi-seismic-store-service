import sinon from 'sinon';
import {AWSCredentials, AWSDataEcosystemServices } from '../../../../src/cloud/providers/aws'; 
import DynamoDB from 'aws-sdk/clients/dynamodb';
import aws from 'aws-sdk';
import { Tx } from '../../utils'; 
import { AWSSSMhelper } from '../../../../src/cloud/providers/aws/ssmhelper';
import axios from 'axios';
import { Config } from '../../../../src/cloud';

export class TestAWSCredentials {

    private static sandbox: sinon.SinonSandbox;
    private static awsCredentials: AWSCredentials;
    private static getItemStub;
    private static mockDynamoDB: Partial<DynamoDB>;
    private static mockSecretsManager: Partial<aws.SecretsManager>;
    private static getSecretValueStub;
  
    public static run() {
          describe(Tx.testInit('AWS Credentials'), () => {

              beforeEach(() => {
                  this.sandbox = sinon.createSandbox();
                  this.sandbox.define(Config, 'CLOUDPROVIDER', 'amazon');
                  this.sandbox.replace(Config, 'FEATURE_FLAG_LOGGING', false);
                  this.sandbox.replace(Config, 'FEATURE_FLAG_TRACE', false);
                  this.sandbox.replace(Config, 'FEATURE_FLAG_STACKDRIVER_EXPORTER', false);

                  this.getItemStub = this.sandbox.stub().returns({
                      promise: this.sandbox.stub().resolves({}),
                  });
                  this.getSecretValueStub = this.sandbox.stub().returns({
                      promise: this.sandbox.stub().resolves({}),
                  });
                  this.mockDynamoDB = {
                    getItem: this.getItemStub,
                  };
                  this.mockSecretsManager = {
                      getSecretValue: this.getSecretValueStub,
                  };
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
        this.mockDynamoDB.getItem = this.sandbox.stub().returns({ promise: this.sandbox.stub().resolves(mockedReturnValue) });
        const result = await this.awsCredentials.getBucketFolder(folder, tenantId, this.mockDynamoDB as DynamoDB);

        Tx.checkTrue(result === 'expectedFolder');
  
      });

      Tx.test(async () => {
          const mockedReturnValue = {
            Item: {},
        };
        this.mockDynamoDB.getItem = this.sandbox.stub().returns({ promise: this.sandbox.stub().resolves(mockedReturnValue) });
        const result = await this.awsCredentials.getBucketFolder(folder, tenantId, this.mockDynamoDB as DynamoDB);
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
        }
        Tx.checkTrue(JSON.stringify(result) === JSON.stringify(expected));

      });
    }

    private static testGetServiceCredentials() {
      Tx.sectionInit('getServiceCredentials method');

      Tx.test(async () => {

        const getSSMParameterStub = this.sandbox.stub(AWSSSMhelper.prototype, 'getSSMParameter');
        getSSMParameterStub.onCall(0).resolves('cognito_name');
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
        
        (AWSCredentials as any).servicePrincipalCredential = mockResponse;
        Tx.checkTrue(result === 'mockAccessToken');
      });
    }

    private static testGetSecrets() {
      Tx.sectionInit('getSecrets method');

      const testName = 'testClientSecretName';
      const testKey = 'testClientSecretDictKey';

      Tx.test(async () => {
        const mockVal = {
          SecretString: `{"${testKey}": "your_secret_value"}`,
          SecretBinary: 'base64_encoded_binary_secret_value'
      };
        
        this.mockSecretsManager.getSecretValue = this.sandbox.stub().returns({ promise: this.sandbox.stub().resolves(mockVal) });
        
        const result = await AWSCredentials.getSecrets(testName, testKey, this.mockSecretsManager as aws.SecretsManager);
        Tx.checkTrue(result === 'your_secret_value');
      });
      Tx.test(async () => {
        const mockVal = {
          SecretString: null,
          SecretBinary: 'base64_encoded_binary_secret_value'
        };
        
        this.mockSecretsManager.getSecretValue = this.sandbox.stub().returns({ promise: this.sandbox.stub().resolves(mockVal) });
        
        const result = await AWSCredentials.getSecrets(testName, testKey, this.mockSecretsManager as aws.SecretsManager);
        const expectedBinary = Buffer.from('base64_encoded_binary_secret_value', 'base64').toString('ascii');
        Tx.checkTrue(result === expectedBinary);
      });
      Tx.test(async () => {
      this.mockSecretsManager.getSecretValue = this.sandbox.stub().returns({ promise: this.sandbox.stub().rejects(new Error('test error')) });
      
      try {
        await AWSCredentials.getSecrets(testName, testKey, this.mockSecretsManager as aws.SecretsManager)
      } catch (err) {
        Tx.checkTrue(err.message === 'test error');
      }
      
      });
    }
  }

