// ============================================================================
// Copyright 2017-2023, Schlumberger
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

import { Config } from '../cloud';

export enum OperationType {
    BULK_DELETE = 'BULK_DELETE',
    COMPUTE_SIZE = 'COMPUTE_SIZE',
    BULK_CHANGE_TIER = 'BULK_CHANGE_TIER',
    RESTORE = 'RESTORE'
}

export const operations = { } as { [key in OperationType]: {
    getQueueName(): string
}};

operations.BULK_DELETE = {
    getQueueName(): string {
        return Config.SMDS_DELETION_QUEUE;
    },
}

operations.COMPUTE_SIZE = {
    getQueueName(): string {
        return Config.SDMS_COMPUTE_SIZE_QUEUE;
    },
}

operations.BULK_CHANGE_TIER = {
    getQueueName(): string {
        return Config.SDMS_CHANGE_TIER_QUEUE;
    },
}

operations.RESTORE = {
    getQueueName(): string {
        return Config.SDMS_RESTORE_QUEUE;
    },
}
