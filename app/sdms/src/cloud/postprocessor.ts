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

import { Config } from './config';
import { CloudFactory } from './cloud';
import { DatasetModel } from '../services/dataset';
import {Feature, FeatureFlags} from '../shared';

export interface IDatasetPostProcessor {
    onDatasetClose(dataset: DatasetModel, datasetId: string): Promise<void>;
}

export abstract class AbstractDatasetPostProcessor implements IDatasetPostProcessor {
    public abstract onDatasetClose(dataset: DatasetModel, datasetId: string): Promise<void>;
}

export class DefaultDatasetPostProcessor extends AbstractDatasetPostProcessor {
    public onDatasetClose(dataset: DatasetModel, datasetId: string): Promise<void> {
        return Promise.resolve();
    }
}

export class DatasetPostProcessorFactory extends CloudFactory {
    public static build(providerLabel: string, args: { [key: string]: any; } = {}): IDatasetPostProcessor {
        if (providerLabel === 'azure' && FeatureFlags.isEnabled(Feature.POST_PROCESS_ON_DATASET_CLOSE)) {
            return CloudFactory.build(providerLabel, AbstractDatasetPostProcessor, args) as IDatasetPostProcessor;
        } else {
            return new DefaultDatasetPostProcessor();
        }
    }
}

export class DatasetPostProcessorFactoryClient {
    public static get(): IDatasetPostProcessor {
        return DatasetPostProcessorFactory.build(Config.CLOUDPROVIDER) as IDatasetPostProcessor;
    }
}
