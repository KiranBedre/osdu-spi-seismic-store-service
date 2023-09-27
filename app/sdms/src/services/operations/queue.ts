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

import { IOperation, IOperationQueueTask, IOperationStatus } from './model';
import { CacheCore, Error } from '../../shared';
import { operations } from './register'

const OPERATION_DEFAULT_KEY_EXPIRE_TIME = 60 * 60 * 24 * 90; // 90 days;
const OPERATION_DEFAULT_STATUS = 'NotStarted';

export class QueueOperations extends CacheCore {

    private getOperationKey(queue: string, operationId: string): string {
        return queue + ':' + operationId;
    }

    private getOperationStatusKey(queue: string, operationId: string): string {
        return queue + ':status:' + operationId;
    }

    public async pushOperation(operation: IOperationQueueTask): Promise<IOperation> {
        const queue = operations[operation.type].getQueueName();
        delete operation.type;
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

    public async getOperationStatus(operation: IOperationQueueTask): Promise<IOperationStatus> {
        const queue = operations[operation.type].getQueueName();
        const operationStatusKey = this.getOperationStatusKey(queue, operation.operation_id);
        const operationStatus = await this.redisClient.hgetall(operationStatusKey);
        if (operationStatus?.OperationId === undefined) {
            const operationKey = this.getOperationKey(queue, operation.operation_id);
            return this.redisClient.exists(operationKey) ? {
                operation_id: operation.operation_id,
                status: OPERATION_DEFAULT_STATUS
            } : undefined as IOperationStatus;
        }

        return {
            operation_id: operationStatus.OperationId,
            status: operationStatus.Status,
            created_at: operationStatus.CreatedAt,
            created_by: operationStatus.CreatedBy,
            last_updated_at: operationStatus.LastUpdatedAt,
            dataset_cnt: operationStatus.DatasetsCnt ? +operationStatus.DatasetsCnt : undefined,
            completed_cnt: operationStatus.CompletedCnt ? +operationStatus.CompletedCnt : undefined,
            failed_cnt: operationStatus.FailedCnt ? +operationStatus.FailedCnt : undefined
        } as IOperationStatus;
    }

}

export const queueOperations = new QueueOperations();
