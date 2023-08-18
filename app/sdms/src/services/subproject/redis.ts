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

import * as Redis from 'ioredis';
import { Config } from '../../cloud';
import { IDeleteOperationQueueTaskModel } from './model';


const deleteJobQueueName = "deletejobqueue";

export class DeleteJobRedisStore {

    private static redisClient: Redis.Redis;

    // Exponential Retry strategy in event of an error
    private static retryStrategy = (times: number) => {
        return Math.pow(2, times) + Math.random() * 100;
    };

    public static async init(cacheParams: { ADDRESS: string, PORT: number, KEY?: string, DISABLE_TLS?: boolean; }) {
        
        if (Config.UTEST) {
            const redis = require('ioredis-mock');
            this.redisClient = new redis();
        } else {

            const redisOptions: Redis.RedisOptions = {
                host: cacheParams.ADDRESS,
                port: cacheParams.PORT,
                connectionName: 'sdms-bulk-delete'
             };
       
             if (cacheParams.KEY) {
                // pragma: allowlist nextline secret
                redisOptions.password = cacheParams.KEY;
                if (!cacheParams.DISABLE_TLS) {
                   redisOptions.tls = { servername: cacheParams.ADDRESS };
                }
             }

            this.redisClient = new Redis.Redis(redisOptions);
        }
    }

    private static getDeleteOperationKey(operationId: string) {
        return deleteJobQueueName + ":" + operationId;
    }

    public static async pushOperation(operation: IDeleteOperationQueueTaskModel) {
        const operationKey = this.getDeleteOperationKey(operation.operation_id);
        await this.redisClient
            .multi()
            .hset(operationKey, operation)
            .lpush(deleteJobQueueName, operation.operation_id)
            .exec();
    }
}
