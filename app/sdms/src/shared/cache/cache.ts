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

import { CacheCore } from './core';

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
}
