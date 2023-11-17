import sinon from 'sinon';
import {AWSCredentials, AWSDataEcosystemServices } from '../../../../src/cloud/providers/aws'; // Adjust the import path accordingly
import DynamoDB from 'aws-sdk/clients/dynamodb';
import { Tx } from '../../utils'; // Adjust the import path to your Tx class
import { AWSSSMhelper } from '../../../../src/cloud/providers/aws/ssmhelper';
import axios from 'axios';
import { Config } from '../../../../src/cloud';

export class TestAWSCredentials {

    private static sandbox: sinon.SinonSandbox;
    private static awsCredentials: AWSCredentials;
    private static getItemStub;
    private static mockDynamoDB: Partial<DynamoDB>;

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
                  this.mockDynamoDB = {
                    getItem: this.getItemStub,
                };
                  this.awsCredentials = new AWSCredentials();
              });

              afterEach(() => { this.sandbox.restore(); });

              this.testGets();
              this.testGetBucketFolder();
              this.testGetStorageCredentials();
              this.testGetServiceCredentials();
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
        const credentials = this.sandbox.stub((this.awsCredentials as any).awsSTSHelper, 'getCredentials').resolves('testCredentials');
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
  }

