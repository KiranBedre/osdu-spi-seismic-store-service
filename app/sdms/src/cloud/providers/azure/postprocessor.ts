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

import { v4 as uuidv4 } from 'uuid';
import { IComputeSizeOperationQueueTask } from './model';
import { AbstractDatasetPostProcessor, DatasetPostProcessorFactory } from '../../postprocessor';
import { DatasetModel } from '../../../services/dataset';
import { OperationType } from '../../../shared/register';
import {TaskQueueFactory} from '../../taskQueue';
import {Config} from '../../config';

@DatasetPostProcessorFactory.register('azure')
export class AzureDatasetPostProcessor extends AbstractDatasetPostProcessor {

    public async onDatasetClose(dataset: DatasetModel, datasetId: string): Promise<void> {
        await this.computeSize(dataset, datasetId);
    }

    private async computeSize(dataset: DatasetModel, datasetId: string): Promise<void> {
        const operation = {
            type: OperationType.COMPUTE_SIZE,
            operation_id: uuidv4(),
            dataset_id: datasetId,
            tenant: dataset.tenant,
            subproject: dataset.subproject,
            path: dataset.path,
            name: dataset.name,
            blobs_path: dataset.gcsurl,
        } as IComputeSizeOperationQueueTask;

        if (dataset.computed_size) {
            operation.dataset_size = dataset.computed_size;
        }

        const taskQueue = TaskQueueFactory.build(Config.CLOUDPROVIDER);
        await taskQueue.pushTask(operation);
    }
}
