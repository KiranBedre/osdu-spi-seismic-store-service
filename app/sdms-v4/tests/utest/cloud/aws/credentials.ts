import sinon from 'sinon';
import { Tx } from "../../utils";
import { AWSConfig, AWSCredentials, AwsSecrets } from '../../../../src/cloud/providers/aws';
import { AWSSSMhelper } from '../../../../src/cloud/providers/aws/ssmhelper';
import axios from 'axios';
import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { Error } from "../../../../src/shared/error";
export class TestAWSCredentials {
    private static sandbox: sinon.SinonSandbox;
    private static awsCredentials: AWSCredentials

    public static run() {
        describe(Tx.testInit('AWS Credentials'), () => {

            beforeEach(() => {
                this.sandbox = sinon.createSandbox();
                
                this.awsCredentials = new AWSCredentials();
                
            }); 

            afterEach(() => { this.sandbox.restore(); });

            this.testGetStorageCredentials();
            this.testGetServiceCredentials();
            this.testGetSecrets();
        });
    }

    private static testGetStorageCredentials() {
        Tx.sectionInit('getStorageCredentials method');

        Tx.test(async ()=> {
            const s3bucket = 'test-s3-bucket';
            const tenantId = 'test-tenant-id';
            const partition = 'test-partition';
            const readonly = true;
            const expectedExpDuration = 1234;  
            
            this.sandbox.stub(AwsSecrets, 'getTenantIdFromPartitionID').resolves(tenantId);
            this.sandbox.stub(AwsSecrets, 'getBucketFromPartitionID').resolves(s3bucket);
            this.sandbox.stub(AWSConfig, 'AWS_REGION').value('us-east-1');
            const getSSMParameterStub = this.sandbox.stub(AWSSSMhelper.prototype, 'getSSMParameter');
            getSSMParameterStub.onCall(0).resolves(expectedExpDuration.toString());
            getSSMParameterStub.onCall(1).resolves('SomeRoleArn');
            this.sandbox.stub((this.awsCredentials as any).awsSTSHelper, 'getCredentials').resolves({
                  AccessKeyId: 'fakeAccessKeyId',
                  SecretAccessKey: 'fakeSecretAccessKey', // pragma: allowlist secret
                  SessionToken: 'fakeSessionToken',
                  Expiration: expectedExpDuration
              });

            const result = await this.awsCredentials.getStorageCredentials(s3bucket, readonly, partition)
            
            const expected = {
                access_token: 'fakeSessionToken:fakeSecretAccessKey:fakeAccessKeyId:us-east-1',
                expires_in: expectedExpDuration,
                token_type: 'unsignedURL: ' + 'https://' + s3bucket + '.s3.amazonaws.com/' + partition + '/' + s3bucket,
            }
            Tx.checkTrue(JSON.stringify(result) === JSON.stringify(expected)) 
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
  
          const result = await this.awsCredentials.getServiceCredentials();
          
          (AWSCredentials as any).servicePrincipalCredential = mockResponse;
          Tx.checkTrue(result === 'mockAccessToken');
        });
      }

      private static testGetSecrets() {
        Tx.sectionInit('getSecrets method');
        const clientSecretName = 'test-secret' // pragma: allowlist secret
        Tx.test(async () => {

            const mockSecretStringData = {
                SecretString: JSON.stringify({ SecretString: 'secret-value' })
            };
    
            this.sandbox.stub(SecretsManagerClient.prototype, 'send').resolves(mockSecretStringData);
    
            const resultSecretString = await AWSCredentials.getSecrets(clientSecretName);
            Tx.checkTrue(resultSecretString === 'secret-value'); // pragma: allowlist secret
        })

        Tx.test(async () => {
            
    
            // Mock data.SecretBinary path
            const mockBinary = Buffer.from('binary-secret', 'ascii').toString('base64');
            const mockSecretBinaryData = {
                SecretBinary: mockBinary
            };
    
            this.sandbox.stub(SecretsManagerClient.prototype, 'send').resolves(mockSecretBinaryData);
    
            const resultSecretBinary = await AWSCredentials.getSecrets(clientSecretName);
            Tx.checkTrue(resultSecretBinary === 'binary-secret'); // pragma: allowlist secret
        })

        Tx.test(async () => {
            this.sandbox.stub(SecretsManagerClient.prototype, 'send').rejects(Error.make(500, 'Test Error'));

            try {
                await AWSCredentials.getSecrets(clientSecretName);
            }
            catch (err) {
                Tx.checkTrue(err.error.code === 500);
            }
        
        })

}
}
