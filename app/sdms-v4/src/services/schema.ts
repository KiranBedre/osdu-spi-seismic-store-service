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

import { Error, Utils, getInMemoryCacheInstance } from '../shared';

import { Config } from '../cloud';
import { SharedCache } from '../shared/cache';
import axios from 'axios';

export class SchemaCoreService {
    public static async getSchema(userToken: string, dataPartition: string, kind: string): Promise<object> {
        const storeTime = 3600 * 24;
        const cache = getInMemoryCacheInstance();

        const res = cache.get<object>(kind);
        if (res) {
            return res;
        } else {
            const sharedRes = await SharedCache.get(kind);
            if (sharedRes) {
                cache.set<object>(kind, sharedRes, storeTime);
                return sharedRes;
            }
        }
        const url = Config.CORE_SERVICE_HOST_SCHEMA + Config.CORE_SERVICE_SCHEMA_BASE_PATH + '/schema/' + kind;
        const options: any = {
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
            },
        };

        options.headers['Authorization'] = Utils.PreBearerToken(userToken);
        options.headers[Config.DATA_PARTITION_ID] = dataPartition;

        try {
            const results: object = (await axios.get(url, options)).data;
            cache.set<object>(kind, results, storeTime);
            await SharedCache.set(kind, results);
            return results;
        } catch (error) {
            if (error.response?.status === 404) {
                error.response.data.message =
                    'schema ' + '(' + error.response.request.path.match('[^/]*$') + ') is not present in repository';
            }
            throw Error.makeForHTTPRequest(error, '[schema-service]');
        }
    }
}
