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

import axios from 'axios';
import { Config, DataEcosystemCoreFactory, LoggerFactory } from '../cloud';
import { Error } from '../shared';
import { DESUtils } from './utils';


export class DESStorage {

    public static async insertRecord(
        userToken: string, seismicMeta: any, esd: string, appkey: string, userId?: string): Promise<void> {

        const dataecosystem = DataEcosystemCoreFactory.build(Config.CLOUDPROVIDER);

        const options = {
            headers: {
                'Accept': 'application/json',
                'AppKey': appkey || Config.DES_SERVICE_APPKEY,
                'Content-Type': 'application/json'
            }
        };
        const data = seismicMeta

        const url = Config.DES_SERVICE_HOST_STORAGE + dataecosystem.getStorageBaseUrlPath() + '/records';

        // tslint:disable-next-line: no-string-literal
        options.headers['Authorization'] = await dataecosystem.getAuthorizationHeader(userToken);
        options.headers[dataecosystem.getDataPartitionIDRestHeaderName()] = DESUtils.getDataPartitionID(esd);

        // Whether or not its undefined, logging helps
        // Logging on this particular flow since we want to validate if the storage service is getting the header
        LoggerFactory.build(Config.CLOUDPROVIDER).info('creating record in storage service with user id = ' + userId);

        if(userId !== undefined){
            options.headers['x-on-behalf-of'] = userId;
        };

        await axios.put(url, data, options).catch((error) => {
            throw (Error.makeForHTTPRequest(error, '[storage-service]'));
        });
    }

    public static async deleteRecord(
        userToken: string, seismicUid: string, esd: string, appkey: string): Promise<void> {

        const dataecosystem = DataEcosystemCoreFactory.build(Config.CLOUDPROVIDER);

        const options = {
            headers: {
                'Accept': 'application/json',
                'AppKey': appkey || Config.DES_SERVICE_APPKEY,
                'Content-Type': 'application/json',
            }
        };
        const url = Config.DES_SERVICE_HOST_STORAGE + dataecosystem.getStorageBaseUrlPath() + '/records/' + seismicUid + ':delete';

        // tslint:disable-next-line: no-string-literal
        options.headers['Authorization'] = await dataecosystem.getAuthorizationHeader(userToken);
        options.headers[dataecosystem.getDataPartitionIDRestHeaderName()] = DESUtils.getDataPartitionID(esd);

        await axios.post(url, '', options).catch((error) => {
            throw (Error.makeForHTTPRequest(error, '[storage-service]'));
        });
    }


    public static async getRecord(
        userToken: string, seismicUid: string, esd: string, appkey: string, recordVersion?: string): Promise<any> {

        const dataecosystem = DataEcosystemCoreFactory.build(Config.CLOUDPROVIDER);

        const httpUrl: string = Config.DES_SERVICE_HOST_STORAGE + dataecosystem.getStorageBaseUrlPath() + '/records/'
            + seismicUid;

        const options = {
            headers: {
                'Accept': 'application/json',
                'AppKey': appkey || Config.DES_SERVICE_APPKEY,
            }
        };
        const url = recordVersion ? httpUrl + '/' + recordVersion : httpUrl;

        // tslint:disable-next-line: no-string-literal
        options.headers['Authorization'] = await dataecosystem.getAuthorizationHeader(userToken);
        options.headers[dataecosystem.getDataPartitionIDRestHeaderName()] = DESUtils.getDataPartitionID(esd);

        const results = await axios.get(url, options).catch((error) => {
            throw (Error.makeForHTTPRequest(error, '[storage-service]'));
        });
        return results.data;
    }



}
