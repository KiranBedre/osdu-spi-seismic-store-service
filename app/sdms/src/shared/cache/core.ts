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

import Redis, { RedisOptions } from 'ioredis';
import { Config } from '../../cloud';

export class CacheCore {

    protected redisClient: Redis;

    public async init(
        host: string, port: number, password: string,
        disableTls: boolean, connectionName = 'sdms-cache'): Promise<void> {

        if (Config.UTEST) {
            const redis = require('ioredis-mock');
            this.redisClient = new redis();
            return;
        }

        if (host && port && !this.redisClient) {
            const redisOptions = {
                host,
                port,
                retryStrategy: (times: number) => {
                    return Math.pow(2, times) + Math.random() * 100;
                },
                maxRetriesPerRequest: 5,
                commandTimeout: 5000,
                connectionName
            } as RedisOptions;
            if (password) {
                redisOptions.password = password;
                if (!disableTls) {
                    redisOptions.tls = { servername: host };
                }
            }

            this.redisClient = new Redis(redisOptions);
            while (this.redisClient.status === 'connecting') {
                await new Promise((resolve) => setTimeout(resolve, 500));
            }
        }
    }

}