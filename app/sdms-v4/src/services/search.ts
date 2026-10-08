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

import { Error, Utils } from '../shared';

import { Config } from '../cloud';
import { Pagination } from '../apis/schema/model';
import axios from 'axios';

export class SearchService {
    public static async searchOnKind(
        userToken: string,
        dataPartition: string,
        datasetKind: string,
        Pagination?: Pagination
    ) {
        const url = Config.CORE_SERVICE_HOST_SEARCH + Config.CORE_SEARCH_BASE_PATH + '/query_with_cursor';
        const data = {
            kind: datasetKind,
        };

        const options: any = {
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
            },
        };
        options.headers['Authorization'] = Utils.PreBearerToken(userToken);
        options.headers[Config.DATA_PARTITION_ID] = dataPartition;

        if (Pagination?.paginationCursor) {
            data['cursor'] = Pagination.paginationCursor;
        }

        if (Pagination?.paginationLimit) {
            data['limit'] = Pagination.paginationLimit;
        }
        try {
            return (await axios.post(url, JSON.stringify(data), options)).data;
        } catch (err) {
            throw Error.makeForHTTPRequest(err, '[search-service]');
        }
    }
}
