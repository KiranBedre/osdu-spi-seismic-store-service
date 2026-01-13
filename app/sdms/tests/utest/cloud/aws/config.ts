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
import { AWSConfig } from '../../../../src/cloud/providers/aws/config';
import { Config } from '../../../../src/cloud/config';
import { AWSSSMhelper } from '../../../../src/cloud/providers/aws/ssmhelper';
import { Tx } from '../../utils';

export class TestAWSConfig {
    private static sandbox: sinon.SinonSandbox;

    public static run() {
        describe(Tx.testInit('AWS Config'), () => {

            beforeEach(() => {
                this.sandbox = sinon.createSandbox();
                
                // Set environment variables to cover all assignment lines
                process.env.AWS_REGION = 'us-east-1';
                process.env.OSDU_INSTANCE_NAME = 'test-instance';
                process.env.PARAMETER_MOUNT_PATH = '/tmp';
                process.env.SERVICE_ENV = 'test';
                process.env.PORT = '3000';
                process.env.LEGAL_BASE_URL = 'http://legal';
                process.env.ENTITLEMENTS_BASE_URL = 'http://entitlements';
                process.env.STORAGE_BASE_URL = 'http://storage';
                process.env.PARTITION_BASE_URL = 'http://partition';
                process.env.DES_SERVICE_APPKEY = 'test-key';
                process.env.IMP_SERVICE_ACCOUNT_SIGNER = 'test-signer';
                process.env.LOGGER_LEVEL = 'debug';
                
                // Feature flags to cover conditional logic
                process.env.FEATURE_FLAG_SEISMICMETA_STORAGE = 'false';
                process.env.FEATURE_FLAG_IMPTOKEN = 'true';
                process.env.FEATURE_FLAG_CCM_INTERACTION = 'true';
                process.env.CCM_SERVICE_URL = 'http://ccm';
                process.env.CCM_TOKEN_SCOPE = 'test-scope';
                process.env.FEATURE_FLAG_POLICY_SVC_INTERACTION = 'true';
                process.env.DES_POLICY_SERVICE_HOST = 'http://policy';
                process.env.SSL_ENABLED = 'true';
                process.env.SSL_KEY_PATH = '/path/to/key';
                process.env.SSL_CERT_PATH = '/path/to/cert';
                process.env.USER_ID_CLAIM_FOR_SDMS = 'custom-subid';
                process.env.USER_ID_CLAIM_FOR_ENTITLEMENTS_SVC = 'custom-email';
                process.env.SDMS_PREFIX = '/custom/api/v3';
            });

            afterEach(() => {
                this.sandbox.restore();
                
                // Clean up static properties that may have been set
                delete (AWSConfig as any).AWS_REGION;
                delete (AWSConfig as any).OSDU_INSTANCE_NAME;
                delete (AWSConfig as any).AWS_TENANT_GROUP_NAME;
                delete (AWSConfig as any).LOGGER_LEVEL;
                
                // Clean up all environment variables
                delete process.env.AWS_REGION;
                delete process.env.OSDU_INSTANCE_NAME;
                delete process.env.PARAMETER_MOUNT_PATH;
                delete process.env.SERVICE_ENV;
                delete process.env.PORT;
                delete process.env.LEGAL_BASE_URL;
                delete process.env.ENTITLEMENTS_BASE_URL;
                delete process.env.STORAGE_BASE_URL;
                delete process.env.PARTITION_BASE_URL;
                delete process.env.DES_SERVICE_APPKEY;
                delete process.env.IMP_SERVICE_ACCOUNT_SIGNER;
                delete process.env.LOGGER_LEVEL;
                delete process.env.FEATURE_FLAG_SEISMICMETA_STORAGE;
                delete process.env.FEATURE_FLAG_IMPTOKEN;
                delete process.env.FEATURE_FLAG_CCM_INTERACTION;
                delete process.env.CCM_SERVICE_URL;
                delete process.env.CCM_TOKEN_SCOPE;
                delete process.env.FEATURE_FLAG_POLICY_SVC_INTERACTION;
                delete process.env.DES_POLICY_SERVICE_HOST;
                delete process.env.SSL_ENABLED;
                delete process.env.SSL_KEY_PATH;
                delete process.env.SSL_CERT_PATH;
                delete process.env.USER_ID_CLAIM_FOR_SDMS;
                delete process.env.USER_ID_CLAIM_FOR_ENTITLEMENTS_SVC;
                delete process.env.SDMS_PREFIX;
            });

            it('should initialize AWS configuration and set all environment variables', async () => {
                // Mock using require cache to avoid descriptor issues
                const fs = require('fs');
                const originalReadFileSync = fs.readFileSync;
                
                fs.readFileSync = this.sandbox.stub().callsFake((filePath: string) => {
                    if (filePath.includes('KEY')) return Buffer.from(JSON.stringify({ token: 'test-redis-key' }));
                    if (filePath.includes('ADDRESS')) return Buffer.from('redis.example.com');
                    if (filePath.includes('PORT')) return Buffer.from('6379');
                    return Buffer.from('{}');
                });

                // Mock SSM helper
                this.sandbox.stub(AWSSSMhelper.prototype, 'getSSMParameter').resolves('test-tenant-group');
                
                // Mock Config.initServiceConfiguration
                this.sandbox.stub(Config as any, 'initServiceConfiguration').resolves();

                const awsConfig = new AWSConfig();
                await awsConfig.init();

                // Verify environment variable assignments (lines 28-35)
                sinon.assert.match(AWSConfig.AWS_REGION, 'us-east-1');
                sinon.assert.match(AWSConfig.OSDU_INSTANCE_NAME, 'test-instance');
                sinon.assert.match(AWSConfig.AWS_TENANT_GROUP_NAME, 'test-tenant-group');
                
                // Verify logger level assignment (lines 40-41)
                sinon.assert.match(AWSConfig.LOGGER_LEVEL, 'debug');
                
                // Restore original function
                fs.readFileSync = originalReadFileSync;
            });

            it('should set default logger level when not provided', async () => {
                delete process.env.LOGGER_LEVEL;
                
                const fs = require('fs');
                const originalReadFileSync = fs.readFileSync;
                fs.readFileSync = this.sandbox.stub().returns(Buffer.from(JSON.stringify({ token: 'test-key' })));
                
                this.sandbox.stub(AWSSSMhelper.prototype, 'getSSMParameter').resolves('tenant');
                this.sandbox.stub(Config as any, 'initServiceConfiguration').resolves();

                const awsConfig = new AWSConfig();
                await awsConfig.init();

                // Verify default logger level (line 41)
                sinon.assert.match(AWSConfig.LOGGER_LEVEL, 'info');
                
                fs.readFileSync = originalReadFileSync;
            });

            it('should process feature flags correctly', async () => {
                const fs = require('fs');
                const originalReadFileSync = fs.readFileSync;
                fs.readFileSync = this.sandbox.stub().returns(Buffer.from(JSON.stringify({ token: 'test-key' })));
                
                this.sandbox.stub(AWSSSMhelper.prototype, 'getSSMParameter').resolves('tenant');
                
                const initStub = this.sandbox.stub(Config as any, 'initServiceConfiguration').resolves();

                const awsConfig = new AWSConfig();
                await awsConfig.init();

                // Verify Config.initServiceConfiguration was called with correct parameters
                sinon.assert.calledOnce(initStub);
                const configCall = initStub.getCall(0).args[0];
                
                // Verify feature flag processing (lines 53-72)
                sinon.assert.match(configCall.FEATURE_FLAG_SEISMICMETA_STORAGE, false);
                sinon.assert.match(configCall.FEATURE_FLAG_IMPTOKEN, true);
                sinon.assert.match(configCall.FEATURE_FLAG_CCM_INTERACTION, true);
                sinon.assert.match(configCall.CCM_SERVICE_URL, 'http://ccm');
                sinon.assert.match(configCall.CCM_TOKEN_SCOPE, 'test-scope');
                sinon.assert.match(configCall.FEATURE_FLAG_POLICY_SVC_INTERACTION, true);
                sinon.assert.match(configCall.SSL_ENABLED, true);
                sinon.assert.match(configCall.SSL_KEY_PATH, '/path/to/key');
                sinon.assert.match(configCall.SSL_CERT_PATH, '/path/to/cert');
                sinon.assert.match(configCall.USER_ID_CLAIM_FOR_SDMS, 'custom-subid');
                sinon.assert.match(configCall.USER_ID_CLAIM_FOR_ENTITLEMENTS_SVC, 'custom-email');
                sinon.assert.match(configCall.SDMS_PREFIX, '/custom/api/v3');
                
                fs.readFileSync = originalReadFileSync;
            });

            it('should use default values when environment variables are not set', async () => {
                // Remove optional environment variables to test defaults
                delete process.env.PORT;
                delete process.env.IMP_SERVICE_ACCOUNT_SIGNER;
                delete process.env.DES_SERVICE_APPKEY;
                delete process.env.USER_ID_CLAIM_FOR_SDMS;
                delete process.env.USER_ID_CLAIM_FOR_ENTITLEMENTS_SVC;
                delete process.env.SDMS_PREFIX;
                
                const fs = require('fs');
                const originalReadFileSync = fs.readFileSync;
                fs.readFileSync = this.sandbox.stub().returns(Buffer.from(JSON.stringify({ token: 'test-key' })));
                
                this.sandbox.stub(AWSSSMhelper.prototype, 'getSSMParameter').resolves('tenant');
                
                const initStub = this.sandbox.stub(Config as any, 'initServiceConfiguration').resolves();

                const awsConfig = new AWSConfig();
                await awsConfig.init();

                const configCall = initStub.getCall(0).args[0];
                
                // Verify default values (lines 53-72)
                sinon.assert.match(configCall.SERVICE_PORT, 5000);
                sinon.assert.match(configCall.IMP_SERVICE_ACCOUNT_SIGNER, '');
                sinon.assert.match(configCall.DES_SERVICE_APPKEY, '');
                sinon.assert.match(configCall.USER_ID_CLAIM_FOR_SDMS, 'subid');
                sinon.assert.match(configCall.USER_ID_CLAIM_FOR_ENTITLEMENTS_SVC, 'email');
                sinon.assert.match(configCall.SDMS_PREFIX, '/seistore-svc/api/v3');
                
                fs.readFileSync = originalReadFileSync;
            });

            it('should handle policy service host fallback', async () => {
                delete process.env.DES_POLICY_SERVICE_HOST;
                process.env.DES_SERVICE_HOST = 'http://des-fallback';
                
                const fs = require('fs');
                const originalReadFileSync = fs.readFileSync;
                fs.readFileSync = this.sandbox.stub().returns(Buffer.from(JSON.stringify({ token: 'test-key' })));
                
                this.sandbox.stub(AWSSSMhelper.prototype, 'getSSMParameter').resolves('tenant');
                
                const initStub = this.sandbox.stub(Config as any, 'initServiceConfiguration').resolves();

                const awsConfig = new AWSConfig();
                await awsConfig.init();

                const configCall = initStub.getCall(0).args[0];
                
                // Verify fallback logic (lines 74-104)
                sinon.assert.match(configCall.DES_POLICY_SERVICE_HOST, 'http://des-fallback');
                
                delete process.env.DES_SERVICE_HOST;
                fs.readFileSync = originalReadFileSync;
            });

            it('should verify static properties', () => {
                // Test static property (line 22-23)
                sinon.assert.match(AWSConfig.DES_GROUP_CHAR_LIMIT, 256);
            });
        });
    }
}
