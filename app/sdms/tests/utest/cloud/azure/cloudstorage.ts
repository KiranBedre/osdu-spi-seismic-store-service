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
import { expect } from 'chai';

import { ContainerClient, BlockBlobClient, BlobBatchClient, BlobServiceClient } from '@azure/storage-blob';
import { AzureCloudStorage } from '../../../../src/cloud/providers/azure';
import { Config } from '../../../../src/cloud';
import { Tx } from '../../utils';

export class TestAzureStorage {
    private static sandbox: sinon.SinonSandbox;
    private static storage: AzureCloudStorage;

    public static run() {

        describe(Tx.testInit('azure cloud storage test'), () => {
            this.sandbox = sinon.createSandbox();

            this.storage = new AzureCloudStorage({ gcpid: 'gcpid', default_acls:'x', esd: 'gcpid@domain.com', name: 'gcpid'});

            beforeEach(()=> {
                this.sandbox.define(Config, 'CLOUDPROVIDER', 'azure');
                this.sandbox.stub(AzureCloudStorage.prototype, 'getBlobServiceClient').resolves(
                    new BlobServiceClient(`https://` + undefined + `.blob.core.windows.net`));
            })

            afterEach(() => {
                this.sandbox.restore();
            });

            this.createBucket();
            this.deleteBucket();
            this.saveObject();
            this.bucketExists();
            this.deleteFiles();
            this.deleteObjects();
            this.getStorageTiers();
        });
    }

    private static createBucket() {
        // Tx.sectionInit('createBucket');
        // Tx.test(async () => {
        //     this.sandbox.stub(ContainerClient.prototype, 'create').resolves();
        //     await this.storage.createBucket('entity','location','class');
        //
        // });
    }

    private static deleteBucket() {
        Tx.sectionInit('deleteBucket');
        Tx.test(async () => {
            this.sandbox.stub(ContainerClient.prototype, 'delete').resolves();
            await this.storage.deleteBucket('entity');
        });
    }

    private static saveObject() {
        Tx.sectionInit('saveObject');
        Tx.test(async () => {
            this.sandbox.stub(BlockBlobClient.prototype, 'uploadStream').resolves();
            await this.storage.saveObject('entity', 'name', 'data');
        });
    }

    private static bucketExists() {
        Tx.sectionInit('bucketExists');
        Tx.test(async () => {
            this.sandbox.stub(ContainerClient.prototype, 'exists').resolves();
            await this.storage.bucketExists('entity');
        });
    }

    private static deleteFiles() {
        Tx.sectionInit('deleteFiles');
        Tx.test(async () => {
            this.sandbox.stub(AzureCloudStorage.prototype, 'generateBlobUrls').resolves(
            ['url1','url2','url3']);
            this.sandbox.stub(BlobBatchClient.prototype, 'deleteBlobs').resolves();
            await this.storage.deleteFiles('entity');
        });
    }

    private static deleteObjects() {
        Tx.sectionInit('deleteObjects');
        Tx.test(async () => {
            this.sandbox.stub(AzureCloudStorage.prototype, 'generateBlobUrls').resolves(
            ['url1','url2','url3']);
            this.sandbox.stub(BlobBatchClient.prototype, 'deleteBlobs').resolves();
            await this.storage.deleteObjects('entity', 'prefix');
        });
    }

    private static getStorageTiers() {
        Tx.sectionInit('getStorageTiers');
        Tx.test(() => {
            const tiers = this.storage.getStorageTiers();
            expect(tiers).to.have.lengthOf(3);
            expect(tiers).to.include('Hot');
            expect(tiers).to.include('Cool');
            expect(tiers).to.include('Cold');
            expect(tiers).to.not.include('Archive');
        });
    }

}
