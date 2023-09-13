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
import { Config } from '../cloud';

export class SharedCache {
    private static redisClient: Redis;
    public static async init(): Promise<void> {
        if (!this.redisClient) {
            const redisOptions = {
                host: Config.REDIS_HOST,
                port: Config.REDIS_PORT,
                retryStrategy: (times: number) => {
                    return Math.pow(2, times) + Math.random() * 100;
                },
                maxRetriesPerRequest: 5,
                commandTimeout: 5000,
            } as RedisOptions;
            if (!Config.REDIS_PWD_DISABLE) {
                redisOptions.password = Config.REDIS_KEY;
            }
            if (!Config.REDIS_TLS_DISABLE) {
                redisOptions.tls = { servername: Config.REDIS_HOST };
            }
            this.redisClient = new Redis(redisOptions);
            while (this.redisClient.status === 'connecting') {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }
    }

    public static async get(key: string): Promise<any> {
        if (this.redisClient) {
            const result = await this.redisClient.get(key);
            if (result) {
                return JSON.parse(result).value;
            }
        }
    }

    public static async set(key: string, value: any, expireTime = 3600): Promise<any> {
        if (this.redisClient) {
            await this.redisClient.setex(key, expireTime, JSON.stringify({ value }));
        }
    }
}
