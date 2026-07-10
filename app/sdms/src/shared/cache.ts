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

export class CacheCore {

    protected static readonly REDIS_MAX_RETRIES_PER_REQUEST = 5;
    protected static readonly REDIS_COMMAND_TIMEOUT_MS = 5000;

    protected redisClient: Redis;

    public async init(
        host: string,
        port: number,
        password: string,
        disableTls: boolean,
        connectionName = 'sdms-shared-cache'): Promise<void> {

        if (Config.UTEST) {
            const redis = require('ioredis-mock');
            this.redisClient = new redis();
            return;
        }

        if (host && port && !this.redisClient) {
            const redisOptions = this.createBaseRedisOptions(host, port, connectionName);

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

    /**
     * Creates base Redis options with common configuration
     * @param host Redis host
     * @param port Redis port
     * @param connectionName Connection name for identification
     * @returns Base RedisOptions object
     */
    protected createBaseRedisOptions(
        host: string,
        port: number,
        connectionName: string
    ): RedisOptions {
        return {
            host,
            port,
            retryStrategy: (times: number) => {
                return Math.pow(2, times) + Math.random() * 100;
            },
            maxRetriesPerRequest: CacheCore.REDIS_MAX_RETRIES_PER_REQUEST,
            commandTimeout: CacheCore.REDIS_COMMAND_TIMEOUT_MS,
            connectionName
        };
    }

    /**
     * Cleanup method for graceful shutdown.
     * Override in derived classes for provider-specific cleanup logic.
     */
    public async cleanup(): Promise<void> {
        // Default: no-op - override in derived classes if cleanup is needed
    }
}

export class Cache extends CacheCore {

    public async get(key: string): Promise<any> {
        if (this.redisClient) {
            const result = await this.redisClient.get(key);
            if (result) {
                return JSON.parse(result).value;
            }
        }
    }

    public async set(key: string, value: any, expireTime = 3600): Promise<any> {
        if (this.redisClient) {
            await this.redisClient.setex(key, expireTime, JSON.stringify({ value }));
        }
    }

    public async getTTL(key: string): Promise<number> {
        if (this.redisClient) {
            return await this.redisClient.ttl(key);
        }
    }

    public isInitialized(): boolean {
        return this.redisClient !== undefined;
    }
}

export let cacheShared = new Cache();

/**
 * Set the active cache instance. Used by cloud providers to inject their specific implementation.
 * @param instance - The cache instance to use
 */
export function setCacheShared(instance: Cache): void {
    cacheShared = instance;
}
