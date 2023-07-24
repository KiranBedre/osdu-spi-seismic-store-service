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

import { Config, CredentialsFactory, SecretsFactory } from '../cloud';
import { Error, Utils, getInMemoryCacheInstance } from '../shared';

import axios from 'axios';

export class PartitionCoreService {
    public static async getPartitionConfiguration(dataPartition: string): Promise<any> {
        const serviceCredentials = await CredentialsFactory.build(Config.CLOUD_PROVIDER).getServiceCredentials();
        const url: string =
            Config.CORE_SERVICE_HOST + Config.CORE_SERVICE_PARTITION_BASE_PATH + '/partitions/' + dataPartition;
        const options = {
            headers: {
                Accept: 'application/json',
                Authorization: Utils.PreBearerToken(serviceCredentials),
                'Content-Type': 'application/json',
            },
        };
        try {
            return (await axios.get(url, options)).data;
        } catch (error) {
            throw Error.makeForHTTPRequest(error);
        }
    }

    public static async getStorageResource(dataPartition: string): Promise<string> {
        const cache = getInMemoryCacheInstance();

        const res = cache.get<string>(dataPartition);
        if (res !== undefined) {
            return res;
        }

        const dataPartitionConfigurations = await this.getPartitionConfiguration(dataPartition);
        const storageConfigs = dataPartitionConfigurations[Config.CORE_SERVICE_PARTITION_STORAGE_ACCOUNT_KEY] as {
            sensitive: boolean;
            value: string;
        };
        if (storageConfigs.sensitive) {
            storageConfigs.value = await SecretsFactory.build(Config.CLOUD_PROVIDER).getSecret(storageConfigs.value);
        }
        cache.set<string>(dataPartition, storageConfigs.value, 3600);
        return storageConfigs.value;
    }
}
