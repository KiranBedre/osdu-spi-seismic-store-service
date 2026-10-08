// ============================================================================
// Copyright 2017-2023, Schlumberger

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

import { AbstractStorage, StorageFactory } from '../../storage';
import { AzureCredentials } from './credentials';
import { AzureSecrets } from './secrets';
import { BlobServiceClient } from '@azure/storage-blob';
import { TokenCredential } from '@azure/identity';

@StorageFactory.register('azure')
export class AzureCloudStorage extends AbstractStorage {
    private blobServiceClient: BlobServiceClient | undefined;
    private defaultAzureCredential: TokenCredential | undefined;
    private dataPartition: string;

    constructor(args: any) {
        super();
        this.defaultAzureCredential = AzureCredentials.getCredential();
        this.dataPartition = args.dataPartition;
    }

    public async getBlobServiceClient(): Promise<BlobServiceClient> {
        if (!this.blobServiceClient) {
            const account = await AzureSecrets.getStorageResourceSecrets(this.dataPartition);
            this.blobServiceClient = new BlobServiceClient(
                `https://${account}.blob.core.windows.net`,
                this.defaultAzureCredential
            );
        }
        return this.blobServiceClient;
    }

    public async createBucket(bucketName: string, metadata: { [key: string]: string }): Promise<void> {
        const container = (await this.getBlobServiceClient()).getContainerClient(bucketName);
        await container.create({ metadata });
    }

    public async bucketExists(bucketName: string): Promise<boolean> {
        const container = (await this.getBlobServiceClient()).getContainerClient(bucketName);
        return await container.exists();
    }

    public async deleteBucket(bucketName: string): Promise<void> {
        const container = (await this.getBlobServiceClient()).getContainerClient(bucketName);
        await container.delete();
    }
}
