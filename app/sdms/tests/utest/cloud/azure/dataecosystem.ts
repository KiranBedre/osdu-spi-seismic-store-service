// ============================================================================
// Copyright 2026, Microsoft Corporation
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

import axios from 'axios';
import { assert } from 'chai';
import sinon from 'sinon';
import { AzureConfig } from '../../../../src/cloud/providers/azure/config';
import { AzureCredentials } from '../../../../src/cloud/providers/azure/credentials';
import { AzureDataEcosystemServices } from '../../../../src/cloud/providers/azure/dataecosystem';
import { Tx } from '../../utils';

export class TestAzureDataEcosystemServices {
    private static sandbox: sinon.SinonSandbox;

    public static run() {
        describe(Tx.testInit('azure data ecosystem tests'), () => {
            beforeEach(() => {
                this.sandbox = sinon.createSandbox();
                AzureConfig.DES_SERVICE_HOST_PARTITION = 'https://partition.example';
                AzureConfig.APP_RESOURCE_ID = 'api://partition';
                this.sandbox.stub(AzureCredentials, 'defaultAzureCredential').value({
                    getToken: this.sandbox.stub().resolves({ token: 'token' })
                });
            });

            afterEach(() => {
                this.sandbox.restore();
                Reflect.deleteProperty(AzureConfig, 'DES_SERVICE_HOST_PARTITION');
                Reflect.deleteProperty(AzureConfig, 'APP_RESOURCE_ID');
            });

            this.getPartitionConfiguration_encodesPartitionId();
            this.getStorageResourceName_usesStandardPartitionProperty();
            this.getStorageResourceName_rejectsMissingPartitionProperty();
        });
    }

    private static getPartitionConfiguration_encodesPartitionId() {
        Tx.sectionInit('getPartitionConfiguration - encodes the partition ID');

        Tx.test(async () => {
            const getStub = this.sandbox.stub(axios, 'get').resolves({ data: {} });

            await AzureDataEcosystemServices.getPartitionConfiguration('../admin?include=secrets');

            assert.equal(
                getStub.firstCall.args[0],
                'https://partition.example/api/partition/v1/partitions/..%2Fadmin%3Finclude%3Dsecrets'
            );
        });
    }

    private static getStorageResourceName_usesStandardPartitionProperty() {
        Tx.sectionInit('getStorageResourceName - uses the standard partition property');

        Tx.test(async () => {
            this.sandbox.stub(AzureDataEcosystemServices, 'getPartitionConfiguration').resolves({
                'storage-account-name': {
                    sensitive: false,
                    value: 'storage-account'
                }
            });

            const account = await AzureDataEcosystemServices.getStorageResourceName(
                'standard-property-test'
            );

            assert.equal(account, 'storage-account');
        });
    }

    private static getStorageResourceName_rejectsMissingPartitionProperty() {
        Tx.sectionInit('getStorageResourceName - rejects a missing partition property');

        Tx.test(async () => {
            this.sandbox.stub(AzureDataEcosystemServices, 'getPartitionConfiguration').resolves({});

            let caught: unknown;
            try {
                await AzureDataEcosystemServices.getStorageResourceName('missing-property-test');
            } catch (error) {
                caught = error;
            }
            assert.instanceOf(caught, Error);
            assert.equal(
                (caught as Error).message,
                'missing partition configuration: storage-account-name'
            );
        });
    }
}
