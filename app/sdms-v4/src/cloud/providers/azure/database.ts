// ============================================================================
// Copyright 2017-2024, Schlumberger

// Licensed under the Apache License, Version 2.0 (the "License");
// You may not use this file except in compliance with the License.
// You may obtain a copy of the License at
// http://www.apache.org/licenses/LICENSE-2.0
// Unless required by applicable law or agreed to in writing, software
// Distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// Limitations under the License.
// ============================================================================

import { AbstractDatabase, DatabaseFactory } from '../../database';
import { CosmosClient, Container } from '@azure/cosmos';
import { AzureSecrets } from './secrets';
import { PartitionCoreService } from '../../../services';

@DatabaseFactory.register('azure')
export class AzureCosmosDb extends AbstractDatabase {
    private dataPartition: string;
    private static containerCache: { [key: string]: Container } = {};

    constructor(args: any) {
        super();
        this.dataPartition = args.dataPartition;
    }

    private async getCosmoContainer(): Promise<Container> {
        const databaseId = 'sdms-db';
        const containerId = 'data';

        if (!AzureCosmosDb.containerCache[this.dataPartition]) {
            const connectionParams = await AzureCosmosDb.getCosmosConnectionParams(this.dataPartition);
            const cosmosClient = new CosmosClient({
                endpoint: connectionParams.endpoint,
                key: connectionParams.key,
            });
            const database = cosmosClient.database(databaseId);
            const container = database.container(containerId);
            AzureCosmosDb.containerCache[this.dataPartition] = container;
        }

        return AzureCosmosDb.containerCache[this.dataPartition];
    }

    public async getStorageUrlFromV3Catalogue(
        subproject: string,
        path: string,
        name: string
    ): Promise<{
        bucket: string;
        virtualFolder: string;
    }> {
        const query = `SELECT c.data.gcsurl
        from c
        where
            c.data.subproject = "${subproject}"
            and c.data.path = "${path}"
            and c.data.name = "${name}"`;

        const result = await (await this.getCosmoContainer()).items.query(query).fetchAll();
        const storageUrl = result.resources[0]?.gcsurl;
        if (!storageUrl) {
            throw new Error(`Cannot get the storage url from provided sdpath \n
                        subproject: ${subproject}, path: ${path}, name: ${name}`);
        }
        let bucket: string;
        let virtualFolder: string;
        if (storageUrl?.includes('/')) {
            [bucket, virtualFolder] = storageUrl.split('/');
        } else {
            bucket = storageUrl;
        }
        return { bucket, virtualFolder };
    }

    private static async getCosmosConnectionParams(
        dataPartitionID: string
    ): Promise<{ endpoint: string; key: string }> {
        const dataPartitionConfigurations = await PartitionCoreService.getPartitionConfiguration(dataPartitionID);

        const cosmosEndpointConfigs = dataPartitionConfigurations[AzureSecrets.DATA_PARTITION_COSMOS_ENDPOINT] as {
            sensitive: boolean;
            value: string;
        };
        if (cosmosEndpointConfigs.sensitive) {
            cosmosEndpointConfigs.value = (
                await AzureSecrets.CreateSecretClient().getSecret(cosmosEndpointConfigs.value)
            ).value;
        }

        const cosmosKeyConfigs = dataPartitionConfigurations[AzureSecrets.DATA_PARTITION_COSMOS_PRIMARY_KEY] as {
            sensitive: boolean;
            value: string;
        };

        if (cosmosKeyConfigs.sensitive) {
            cosmosKeyConfigs.value = (await AzureSecrets.CreateSecretClient().getSecret(cosmosKeyConfigs.value)).value;
        }

        // return storageConfigs.value;
        return { endpoint: cosmosEndpointConfigs.value, key: cosmosKeyConfigs.value };
    }
}
