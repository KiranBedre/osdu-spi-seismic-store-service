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

import { Config, DataEcosystemCoreFactory } from '../cloud';
import { Error, getInMemoryCacheInstance } from '../shared';

import axios from 'axios';

export class DESCompliance {

    public static async isLegalTagValid(
        userToken: string, ltag: string, dataPartitionID: string, appkey: string): Promise<boolean> {

        const cache = getInMemoryCacheInstance();
        const cacheKey = 'ltag-' + ltag;
        const res = cache.get<boolean>(cacheKey);
        if (res !== undefined && res) { return res };

        const dataecosystem = DataEcosystemCoreFactory.build(Config.CLOUDPROVIDER);

        const options = {
            headers: {
                'Accept': 'application/json',
                'AppKey': appkey || Config.DES_SERVICE_APPKEY,
                'Content-Type': 'application/json'
            }
        };
        const data = {
            'names': [ltag]
        };
        const url = Config.DES_SERVICE_HOST_COMPLIANCE + dataecosystem.getComplianceBaseUrlPath() +
            '/legaltags:validate';

        options.headers['Authorization'] = await dataecosystem.getAuthorizationHeader(userToken);
        options.headers[dataecosystem.getDataPartitionIDRestHeaderName()] = dataPartitionID;

        try {

            const results = await axios.post(url, data, options);
            cache.set(cacheKey, results.data.invalidLegalTags.length === 0, 3600);
            return results.data.invalidLegalTags.length === 0;

        } catch (error) {

            throw (Error.makeForHTTPRequest(error, '[compliance-service]'));
        };
    }

}