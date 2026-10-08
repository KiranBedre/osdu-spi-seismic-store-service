// ============================================================================
// Copyright 2017-2025, Schlumberger

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
import { Container, CosmosClient } from '@azure/cosmos';

import { AzureConfig } from './config';
import { AzureSecrets } from './secrets';
import { PartitionService } from '../../../shared';

@DatabaseFactory.register('azure')
export class AzureCosmosDb extends AbstractDatabase {
    private dataPartition: string;
    private static containerCache: { [key: string]: Container } = {};

    constructor(args: any) {
        super();
        this.dataPartition = args.dataPartition;
    }

    async getDBContainer(): Promise<Container> {
        const databaseId = 'sdms-db';
        const containerId = 'data';

        if (!AzureCosmosDb.containerCache[this.dataPartition]) {
            const { endpoint, key } = await AzureCosmosDb.getConnectionParams(
                this.dataPartition,
                AzureConfig.AZURE_CREDENTIAL
            );
            const cosmosClient = new CosmosClient({
                endpoint,
                key,
            });
            const database = cosmosClient.database(databaseId);
            const container = database.container(containerId);
            AzureCosmosDb.containerCache[this.dataPartition] = container;
        }

        return AzureCosmosDb.containerCache[this.dataPartition];
    }

    public static async getConnectionParams(dataPartitionID: string, credential) {
        const dataPartitionConfigurations = await PartitionService.getPartitionConfiguration(
            dataPartitionID,
            credential
        );

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

        return { endpoint: cosmosEndpointConfigs.value, key: cosmosKeyConfigs.value };
    }
}
