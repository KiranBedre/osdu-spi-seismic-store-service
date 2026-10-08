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
import axios from 'axios';

export class StorageCoreService {
    public static async insertRecords(
        userToken: string,
        records: object[],
        dataPartition: string,
        skipDupes = false
    ): Promise<string[]> {
        let url = Config.CORE_SERVICE_HOST_STORAGE + Config.CORE_SERVICE_STORAGE_BASE_PATH + '/records';
        if (skipDupes === true) {
            url = url + '?skipdupes=true';
        }
        const data = JSON.stringify(records);
        const options: any = {
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
            },
        };

        options.headers['Authorization'] = Utils.PreBearerToken(userToken);
        options.headers[Config.DATA_PARTITION_ID] = dataPartition;

        try {
            const response = await (await axios.put(url, data, options)).data;
            return response.recordIdVersions;
        } catch (error) {
            throw Error.makeForHTTPRequest(error, '[storage-service]');
        }
    }

    public static async getRecord(
        userToken: string,
        recordId: string,
        dataPartition: string,
        recordVersion?: string
    ): Promise<any> {
        let url = Config.CORE_SERVICE_HOST_STORAGE + Config.CORE_SERVICE_STORAGE_BASE_PATH + '/records/' + recordId;

        if (recordVersion) {
            url = url + '/' + recordVersion;
        }

        const options: any = {
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
            },
        };

        options.headers['Authorization'] = Utils.PreBearerToken(userToken);
        options.headers[Config.DATA_PARTITION_ID] = dataPartition;

        try {
            return (await axios.get(url, options)).data;
        } catch (error) {
            throw Error.makeForHTTPRequest(error, '[storage-service]');
        }
    }

    public static async deleteRecord(userToken: string, recordId: string, dataPartition: string): Promise<void> {
        const url = Config.CORE_SERVICE_HOST_STORAGE + Config.CORE_SERVICE_STORAGE_BASE_PATH + '/records/' + recordId;
        const options: any = {
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
            },
        };

        options.headers['Authorization'] = Utils.PreBearerToken(userToken);
        options.headers[Config.DATA_PARTITION_ID] = dataPartition;

        try {
            await axios.delete(url, options);
        } catch (error) {
            throw Error.makeForHTTPRequest(error, '[storage-service]');
        }
    }

    public static async getAllVersions(userToken: string, recordId: string, dataPartition: string): Promise<any> {
        const url =
            Config.CORE_SERVICE_HOST_STORAGE + Config.CORE_SERVICE_STORAGE_BASE_PATH + '/records/versions/' + recordId;
        const options: any = {
            headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
            },
        };

        options.headers['Authorization'] = Utils.PreBearerToken(userToken);
        options.headers[Config.DATA_PARTITION_ID] = dataPartition;

        try {
            return (await axios.get(url, options)).data.versions;
        } catch (error) {
            throw Error.makeForHTTPRequest(error, '[storage-service]');
        }
    }
}
