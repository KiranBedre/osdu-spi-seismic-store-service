// ============================================================================
// Copyright 2017-2021, Schlumberger
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

import sinon from 'sinon';
import { assert } from 'chai';

import { KeyVault } from '../../../../src/cloud/providers/azure/keyvault';
import { AzureConfig } from '../../../../src/cloud/providers/azure/config';
import { Tx } from '../../utils';
import { KeyVaultSecret } from '@azure/keyvault-secrets';

const mockAIConnectionString = 'mockAIConnectionString';
const mockRedisKey = 'mockRedisKey';
const mockRedisHost= 'mockRedisHost';
const mockRedisQueueKey = 'mockRedisQueueKey';
const mockRedisQueueHost= 'mockRedisQueueHost';
const mockAzureQueueEndpoint = 'mockAzureQueueEndpoint';

// pragma: allowlist nextline secret
const mockSpClientSecret = 'mockSpClientSecret';
const mockSpAppSourceID = 'mockSpAppSourceID';
const mockSauthProvider = 'mockSauthProvider';

const mockSecretClient = {
    getSecret:  (secretName: string) => {
        return new Promise<KeyVaultSecret>((resolve, _reject) => {
            if (secretName === KeyVault.AI_CONNECTION_STRING) {
                resolve({
                    value: mockAIConnectionString,
                } as any)
            }
            if (secretName === KeyVault.REDIS_KEY) {
                resolve( {
                    value: mockRedisKey,
                } as any)
            }
            if (secretName === KeyVault.REDIS_HOST) {
                resolve( {
                    value: mockRedisHost,
                } as any)
            }
            if (secretName === KeyVault.REDIS_QUEUE_KEY) {
                resolve( {
                    value: mockRedisQueueKey,
                } as any)
            }
            if (secretName === KeyVault.REDIS_QUEUE_HOST) {
                resolve( {
                    value: mockRedisQueueHost,
                } as any)
            }
            if (secretName === KeyVault.APP_RESOURCE_ID) {
                resolve( {
                    value: mockSpAppSourceID,
                } as any)
            }
            if (secretName === KeyVault.SERVICE_AUTH_PROVIDER_CREDENTIAL) {
                resolve( {
                    value: mockSauthProvider,
                } as any)
            }
            if (secretName === KeyVault.STORAGE_QUEUE_ENDPOINT) {
                resolve( {
                    value: mockAzureQueueEndpoint,
                } as any)
            }
        })
    },
} as any;

export class TestAzureKeyVault {
    private static sandbox: sinon.SinonSandbox;

    public static run() {

        describe(Tx.testInit('azure keyvault test'), () => {
            this.sandbox = sinon.createSandbox();

            afterEach(() => {
                this.sandbox.restore();

                delete AzureConfig.AI_CONNECTION_STRING;
                delete AzureConfig.LOCKSMAP_REDIS_INSTANCE_KEY;
                delete AzureConfig.LOCKSMAP_REDIS_INSTANCE_ADDRESS;
                delete AzureConfig.REDIS_SHARED_INSTANCE_KEY;
                delete AzureConfig.REDIS_SHARED_INSTANCE_ADDRESS;
                delete AzureConfig.APP_RESOURCE_ID;
                delete AzureConfig.SERVICE_AUTH_PROVIDER_CREDENTIAL;
                delete AzureConfig.AZURE_STORAGE_QUEUE_ENDPOINT;
            });

            this.TestGetSecrets();
        });
    }

    private static TestGetSecrets() {

        Tx.sectionInit('TestGetSecrets');
        Tx.test(async () => {
            await KeyVault.loadSecrets(mockSecretClient);
            assert.equal(AzureConfig.AI_CONNECTION_STRING, mockAIConnectionString);
            assert.equal(AzureConfig.LOCKSMAP_REDIS_INSTANCE_KEY, mockRedisQueueKey);
            assert.equal(AzureConfig.LOCKSMAP_REDIS_INSTANCE_ADDRESS, mockRedisQueueHost);
            assert.equal(AzureConfig.REDIS_SHARED_INSTANCE_KEY, mockRedisKey);
            assert.equal(AzureConfig.REDIS_SHARED_INSTANCE_ADDRESS, mockRedisHost);
            assert.equal(AzureConfig.APP_RESOURCE_ID, mockSpAppSourceID);
            assert.equal(AzureConfig.SERVICE_AUTH_PROVIDER_CREDENTIAL, mockSauthProvider);
            assert.equal(AzureConfig.AZURE_STORAGE_QUEUE_ENDPOINT, mockAzureQueueEndpoint);
        });
    }

}
