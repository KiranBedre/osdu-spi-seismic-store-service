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

import * as Redis from 'ioredis';
import { Config } from '../../cloud';
import { IDeleteOperationQueueTaskModel, IDeleteOperationStatusModel } from './model';
import def from 'ajv/dist/vocabularies/discriminator';


const deleteJobQueueName = "deletejobqueue";
const defaultOperationStatus = "NOT_STARTED";

export class DeleteJobRedisStore {

    private static redisClient: Redis.Redis;

    public static async init(cacheParams: { ADDRESS: string, PORT: number, KEY?: string, DISABLE_TLS?: boolean; }) {
        
        if (Config.UTEST) {
            const redis = require('ioredis-mock');
            this.redisClient = new redis();
            return;
        }

        const redisOptions: Redis.RedisOptions = {
            host: cacheParams.ADDRESS,
            port: cacheParams.PORT,
            connectionName: 'sdms-bulk-delete'
        };
    
        if (cacheParams.KEY) {
            redisOptions.password = cacheParams.KEY;
            if (!cacheParams.DISABLE_TLS) {
                redisOptions.tls = { servername: cacheParams.ADDRESS };
            }
        }

        this.redisClient = new Redis.Redis(redisOptions);
    }

    private static getDeleteOperationKey(operationId: string) {
        if (Config.INTTEST) {
            return deleteJobQueueName + ":inttest:" + operationId;
        }
        return deleteJobQueueName + ":" + operationId;
    }

    private static getDeleteOperationStatusKey(operationId: string) {
        if (Config.INTTEST) {
            return deleteJobQueueName + ":inttest:status:" + operationId;
        }
        return deleteJobQueueName + ":status:" + operationId;
    }

    public static async pushOperation(operation: IDeleteOperationQueueTaskModel) {
        const operationKey = this.getDeleteOperationKey(operation.operation_id);
        await this.redisClient
            .multi()
            .hset(operationKey, operation)
            .lpush(deleteJobQueueName, operation.operation_id)
            .exec();
    }

    public static async getOperationStatus(operationId: string): Promise<IDeleteOperationStatusModel> {
        const operationStatusKey = this.getDeleteOperationStatusKey(operationId);
        const operation = await this.redisClient.hgetall(operationStatusKey);

        if (operation === undefined || operation.OperationId === undefined) {

            if (this.redisClient.exists(this.getDeleteOperationKey(operationId))) {
                return {
                    operation_id: operationId,
                    status: defaultOperationStatus
                };
            }
            return undefined;
        }

        return {
            operation_id: operation.OperationId,
            status: operation.Status,
            created_at: operation.CreatedAt,
            created_by: operation.CreatedBy,
            last_updated_at: operation.LastUpdatedAt,
            dataset_cnt: operation.DatasetsCnt ? Number(operation.DatasetsCnt) : undefined,
            deleted_cnt: operation.DeletedCnt ? Number(operation.DeletedCnt) : undefined,
            failed_cnt: operation.FailedCnt ? Number(operation.FailedCnt) : undefined
        };
    }
}
