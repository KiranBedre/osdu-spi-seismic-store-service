// ============================================================================
// Copyright 2017-2022, Schlumberger
//
// Licensed under the Apache License, Version 2.0 (the "License");
// You may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// Distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// Limitations under the License.
// ============================================================================

import { Config, QueueFactory } from '../cloud';

import { JobType } from './types';
import { Parser } from './parser';
import { v4 as uuidv4 } from 'uuid';

export class Jobs {
    public static async pushSyncV3V4Msg(records, recordIds, dataPartition) {
        const messages = Parser.generateSyncV3V4Msg(records, recordIds, dataPartition);
        const operation = {
            type: JobType.SyncV3V4,
            operation_id: uuidv4(),
            datasets: messages,
        };

        const taskQueue = QueueFactory.build(Config.CLOUD_PROVIDER);
        await taskQueue.pushTask(operation);
    }
}
