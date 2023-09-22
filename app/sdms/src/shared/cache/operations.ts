// ============================================================================
// Copyright 2017-2023, Schlumberger
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

import { Config } from '../../cloud';
import { CacheCore } from './core';

const OPERATION_DEFAULT_KEY_EXPIRE_TIME = 60 * 60 * 24 * 90; // 90 days;
const OPERATION_DEFAULT_STATUS = 'NotStarted';

export interface IOperation extends Record<string, string | number | Record<string, string | number>> {
    operation_id: string;
}

export interface IOperationStatus extends IOperation {
    status?: string;
    result?: Record<string, string | number>
}

export enum OperationType {
    BULK_DELETE = 'BULK_DELETE'
}

const operations = { } as { [key in OperationType]: {
    getQueue(): string
}};

operations.BULK_DELETE = {
    getQueue(): string {
        return Config.REDIS_DELETION_QUEUE;
    },
}

export class CacheOperations extends CacheCore {

    private getOperationKey(queue: string, operationId: string): string {
        return queue + ':' + operationId;
    }

    private getOperationStatusKey(queue: string, operationId: string): string {
        return queue + ':status:' + operationId;
    }

    public async pushOperation(type: OperationType, operation: IOperation): Promise<IOperation> {
        const queue = operations[type].getQueue();
        const operationKey = this.getOperationKey(queue, operation.operation_id);
        await this.redisClient
            .multi()
            .hset(operationKey, operation)
            .expire(operationKey, OPERATION_DEFAULT_KEY_EXPIRE_TIME)
            .lpush(queue, operation.operation_id)
            .exec();
        return {
            operation_id: operation.operation_id
        }
    }

    public async getOperationStatus(type: OperationType, operationId: string): Promise<IOperationStatus> {
        const queue = operations[type].getQueue();
        const operationStatusKey = this.getOperationStatusKey(queue, operationId);
        const operation = await this.redisClient.hgetall(operationStatusKey);
        if (operation?.OperationId === undefined) {
            const operationKey = this.getOperationKey(queue, operationId);
            return this.redisClient.exists(operationKey) ? {
                operation_id: operationId,
                status: OPERATION_DEFAULT_STATUS
            } : undefined;
        } else {
            return {
                operation_id: operationId,
                result: operation,
            };
        }
    }

}
