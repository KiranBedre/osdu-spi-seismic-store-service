// ============================================================================
// Copyright 2017-2024, Microsoft
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

import { CloudFactory } from './cloud';
import { IOperationQueueTask } from '../jobs';

export interface IQueue {
    pushTask(task: IOperationQueueTask): Promise<void>;
}

export abstract class AbstractQueue implements IQueue {
    public abstract pushTask(task: IOperationQueueTask): Promise<void>;
}

export class QueueFactory extends CloudFactory {
    public static build(providerLabel: string): IQueue {
        return CloudFactory.build(providerLabel, AbstractQueue) as IQueue;
    }
}
