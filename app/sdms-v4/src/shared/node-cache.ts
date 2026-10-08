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

import NodeCache from 'node-cache';

let inMemoryCache: InMemoryCache;

export function getInMemoryCacheInstance(): InMemoryCache {
    if (!inMemoryCache) {
        inMemoryCache = new InMemoryCache();
    }
    return inMemoryCache;
}

export class InMemoryCache {
    private nodeCache: NodeCache;
    constructor() {
        this.nodeCache = new NodeCache({
            stdTTL: 60,
            checkperiod: 61,
        });
    }

    public get<T>(key: string): T {
        const result = this.nodeCache.get<T>(key);
        return result ? result : undefined;
    }

    public set<T>(key: string, value: T, ttl: number) {
        this.nodeCache.set(key, value, ttl);
    }

    public delete(key: string) {
        this.nodeCache.del(key);
    }
}
