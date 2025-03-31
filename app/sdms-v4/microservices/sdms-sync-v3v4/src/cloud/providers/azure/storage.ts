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

import { AbstractStorage, StorageFactory } from '../../storage';
import { DefaultAzureCredential, TokenCredential } from '@azure/identity';

import { AzureSecrets } from './secrets';
import { BlobInfo } from '../../../model';
import { BlobServiceClient } from '@azure/storage-blob';

@StorageFactory.register('azure')
export class AzureCloudStorage extends AbstractStorage {
    private blobServiceClient: BlobServiceClient | undefined;
    private defaultAzureCredential: TokenCredential | undefined;
    private dataPartition: string;

    constructor(args: any) {
        super();
        this.defaultAzureCredential = new DefaultAzureCredential();
        this.dataPartition = args.dataPartition;
    }

    public async listBlobs(bucketName: string): Promise<BlobInfo[]> {
        const container = (await this.getBlobServiceClient()).getContainerClient(bucketName);
        const blobList = [];

        for await (const blob of container.listBlobsFlat()) {
            const data = {
                name: blob.name,
                size: blob.properties.contentLength,
                tier: blob.properties.accessTier,
            };
            blobList.push(data);
        }

        return blobList;
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
}
