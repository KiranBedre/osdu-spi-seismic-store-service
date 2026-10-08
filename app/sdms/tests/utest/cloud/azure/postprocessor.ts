// ============================================================================
// Copyright 2017-2023, Microsoft
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

import { Config } from '../../../../src/cloud';
import {AzureConfig, AzureDatasetPostProcessor, AzureTaskQueue} from '../../../../src/cloud/providers/azure';
import { DatasetModel } from '../../../../src/services/dataset';
import { IOperation } from '../../../../src/shared/model';
import { Tx } from '../../utils';
import {OperationType} from "../../../../src/shared/register";
import {v4 as uuidv4} from "uuid";
import {IComputeSizeOperationQueueTask} from "../../../../src/cloud/providers/azure/model";
import {assert} from "chai";

export class TestAzureDatasetPostProcessor {
    
    private static sandbox = sinon.createSandbox();
    private static postProcessor = new AzureDatasetPostProcessor();

    public static run() {

        describe(Tx.testInit('azure dataset post processor'), () => {

            let backup: string;
            beforeEach(() => {
                backup = Config.CLOUDPROVIDER;
                this.sandbox.define(Config, 'CLOUDPROVIDER', 'azure');
            });

            afterEach(()=>{
                Config.CLOUDPROVIDER = backup;
                this.sandbox.restore();
            })

            this.onDatasetClose();
        });
    }

    private static onDatasetClose() {
        Tx.sectionInit('onDatasetClose');
        Tx.test(async () => {
            const dataset = this.getDataset();
            let datasetId = 'datasetId';
            const pushOperationStub = this.sandbox.stub(AzureTaskQueue.prototype, 'pushTask');

            await this.postProcessor.onDatasetClose(dataset, datasetId);
            this.sandbox.assert.calledOnce(pushOperationStub);
            const operation = pushOperationStub.getCall(0).args[0] as IComputeSizeOperationQueueTask;
            assert.equal(operation.dataset_id, datasetId);
            assert.equal(operation.type, OperationType.COMPUTE_SIZE);
            assert.equal(operation.dataset_size, dataset.computed_size);
            assert.equal(operation.path, dataset.path);
            assert.equal(operation.tenant, dataset.tenant);
            assert.equal(operation.subproject, dataset.subproject);
            assert.equal(operation.blobs_path, dataset.gcsurl);
        });
    }

    private static getDataset(): DatasetModel {
        return {
            name: 'name',
            tenant: 'tenant',
            subproject: 'subproject',
            path: '/path/to/the/folder/',
            created_date: '',
            last_modified_date: '',
            created_by: '',
            metadata: undefined,
            filemetadata: undefined,
            gcsurl: '',
            type: '',
            ltag: '',
            ctag: '0000000000000000',
            sbit: '',
            sbit_count: 0,
            gtags: ['gtag1'],
            readonly: false,
            seismicmeta_guid: '',
            transfer_status: '',
            acls: { admins: [], viewers: [] },
            access_policy: '',
            computed_size: 1024,
            computed_size_date: ''
        };
    }
}
