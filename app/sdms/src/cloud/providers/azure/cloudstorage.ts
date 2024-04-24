// ============================================================================
// Copyright 2017-2022, Schlumberger
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

import { TokenCredential } from '@azure/identity';
import { BlobBatchClient, BlobItem, BlobServiceClient } from '@azure/storage-blob';
import { BlockBlobTier } from '@azure/storage-blob';
import { Readable } from 'stream';
import { AzureInsightsLogger } from '.';

import { TenantModel } from '../../../services/tenant';
import { Config } from '../../config';
import { AbstractStorage, StorageFactory } from '../../storage';
import { AzureCredentials } from './credentials';
import { AzureDataEcosystemServices } from './dataecosystem';

@StorageFactory.register('azure')
export class AzureCloudStorage extends AbstractStorage {
    private AZURE_CONTAINER_PREFIX = 'ss-' + Config.SERVICE_ENV;
    private blobServiceClient: BlobServiceClient;
    private blobBatchClient: BlobBatchClient;
    private defaultAzureCredential: TokenCredential;
    private dataPartition: string;

    public async getBlobServiceClient(): Promise<BlobServiceClient> {
        if (!this.blobServiceClient) {
            const account = await AzureDataEcosystemServices.getStorageResourceName(this.dataPartition);
            this.blobServiceClient = new BlobServiceClient(
                `https://${account}.blob.core.windows.net`,
                this.defaultAzureCredential
            );
        }
        return this.blobServiceClient;
    }


    private async getBlobBatchClient() {
        if (!this.blobBatchClient) {
            this.blobBatchClient = (await this.getBlobServiceClient()).getBlobBatchClient();
        }
        return this.blobBatchClient;
    }


    public constructor(tenant: TenantModel) {
        super();
        this.defaultAzureCredential = AzureCredentials.getCredential();
        this.dataPartition = tenant?.esd.indexOf('.') !== -1 ? tenant?.esd.split('.')[0] : tenant.esd;

    }

    // generate a random container name
    public async randomBucketName(): Promise<string> {
        let suffix = Math.random().toString(36).substring(2, 15);
        suffix = suffix + Math.random().toString(36).substring(2, 15);
        suffix = suffix.substr(0, 15);
        return this.AZURE_CONTAINER_PREFIX + '-' + suffix;
    }

    // Create a new container
    public async createBucket(
        bucketName: string, location: string, storageClass: string): Promise<void> {
        const container = (await this.getBlobServiceClient()).getContainerClient(bucketName);
        await container.create();
    }

    // Delete a container
    public async deleteBucket(bucketName: string, force = false): Promise<void> {
        const container = (await this.getBlobServiceClient()).getContainerClient(bucketName);
        await container.delete();
    }

    // Delete all files in a container
    public async deleteFiles(bucketName: string): Promise<void> {
        const blobUrls = await this.generateBlobUrls(bucketName);
        if (!blobUrls.length) {
            return;
        }
        const batchClient = await this.getBlobBatchClient();
        batchClient.deleteBlobs(blobUrls, this.defaultAzureCredential).catch((error) => {
            console.error(error)
        });
    }

    // Generate array of blob URLs used when deleting in batch
    public async generateBlobUrls(bucketName: string, prefix?: string): Promise<string[]> {
        const container = (await this.getBlobServiceClient()).getContainerClient(bucketName);
        let blobs = null;
        if (prefix) {
            blobs = container.listBlobsByHierarchy('/', { prefix: prefix + '/' });
        }
        else {
            blobs = container.listBlobsFlat();
        }
        const blobUrls = new Array();
        let blobItem = await blobs.next();
        while (!blobItem.done) {
            blobUrls.push(container.getBlobClient(blobItem.value.name).url);
            blobItem = await blobs.next();
        }
        return blobUrls;
    }

    // save an object/file/blob to a container
    public async saveObject(bucketName: string, objectName: string, data: string): Promise<void> {
        const streamData = Readable.from([data]);
        const container = (await this.getBlobServiceClient()).getContainerClient(bucketName);
        const blobClient = container.getBlobClient(objectName);
        const blockClient = blobClient.getBlockBlobClient();

        await blockClient.uploadStream(streamData);
    }

    // delete multiple objects from a container
    public async deleteObjects(bucketName: string, prefix: string): Promise<void> {
        if (prefix) { // datasets managed as subfolder path into the container
            const blobUrlsAsOne = await this.generateBlobUrls(bucketName, prefix);
            const batchSize = 256; // MAX size set by Azure SDK is 256 changes per request
            const blobUrlsSplit = [];
            while (blobUrlsAsOne.length) {
                blobUrlsSplit.push(
                    blobUrlsAsOne.splice(0, batchSize)
                )
            }
            if (blobUrlsSplit.length) {
                const batchClient = await this.getBlobBatchClient();
                if(Config.FALLBACK_DATASET_DELETE) {
                    for (const chunk of blobUrlsSplit) {
                        batchClient.deleteBlobs(chunk, this.defaultAzureCredential).catch((error) => {
                            console.error(error)
                        })
                    };
                } else {
                    for (const chunk of blobUrlsSplit) {
                        await batchClient.deleteBlobs(chunk, this.defaultAzureCredential);
                    }
                }
            }
        } else {  // datasets managed as separate containers
            await this.deleteBucket(bucketName);
        }
    }

    /* copy multiple objects from one container to another
        TODO: Find out how ownerEmail is being used, it doesn't appear to be used in the GCS implementation
    */
    public async copy(bucketIn: string, prefixIn: string, bucketOut: string,
        prefixOut: string, ownerEmail: string): Promise<void> {
        const containerIn = (await this.getBlobServiceClient()).getContainerClient(bucketIn);
        const containerOut = (await this.getBlobServiceClient()).getContainerClient(bucketOut);
        const blobs = containerIn.listBlobsFlat({ prefix: prefixIn });
        const copyCalls = [];
        let blobItem = await blobs.next();
        while (!blobItem.done) {
            const blobClientIn = containerIn.getBlobClient(blobItem.value.name);
            const blobClientOut = containerOut.getBlobClient(blobItem.value.name.replace(prefixIn, prefixOut));
            copyCalls.push(blobClientOut.beginCopyFromURL(blobClientIn.url));
            blobItem = await blobs.next();
        }
        await Promise.all(copyCalls);
    }

    // check if a container exist
    public async bucketExists(bucketName: string): Promise<boolean> {
        const container = (await this.getBlobServiceClient()).getContainerClient(bucketName);
        return await container.exists();
    }

    // delete all buckets starting with
    public async deleteBuckets(bucketsNamePrefix: string): Promise<void> {
        const containers = (await this.getBlobServiceClient()).listContainers({ prefix: bucketsNamePrefix });
        for await (const container of containers) {
            this.deleteBucket(container.name).catch((err) => {
                new AzureInsightsLogger().error(err);
            });;
        }
    }

    public getStorageTiers(): string[] {
        return Object.keys(BlockBlobTier);
    }

    public async getObjectSize(bucketName: string, prefix?: string): Promise<number> {

        const container = (await this.getBlobServiceClient()).getContainerClient(bucketName);
        let totalSize = 0;

        // if access_policy == 'uniform' go to if path
        // if access_policy == 'dataset' go to else path
        if (prefix) {
            const items = container.listBlobsByHierarchy('/', { prefix: prefix + '/' });
            for await (const item of items) {
                if (item.kind !== 'prefix') {
                    totalSize += item.properties.contentLength;
                }
            }
        } else {
            const items = container.listBlobsFlat();
            for await (const item of items) {
                totalSize += item.properties.contentLength;
            }
        }
        return totalSize;
    }

}
