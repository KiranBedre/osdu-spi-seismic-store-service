// ============================================================================
// Copyright 2017-2025, Schlumberger
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

import { Config, QueueFactory } from './cloud';
import { Error, Utils } from './shared';
import { ILogger, LoggerFactory } from './cloud/logger';
import { IStorage, StorageFactory } from './cloud/storage';

import { Container } from '@azure/cosmos';
import { DatabaseFactory } from './cloud/database';
import { IQueue } from './cloud/queue';

export class VersionSyncService {
    private databaseContainer: Container;
    private storage: IStorage;
    private queue: IQueue;
    private logger: ILogger;
    private POLLING_INTERVAL = 60000;

    public async syncService() {
        try {
            this.logger = LoggerFactory.build(Config.CLOUD_PROVIDER);
            this.queue = QueueFactory.build(Config.CLOUD_PROVIDER);
            // eslint-disable-next-line no-constant-condition
            while (true) {
                const messages = await this.queue.fetchMessage(Config.SDMS_V3_V4_SYNC_QUEUE);
                if (messages.length > 0) {
                    await Promise.all(
                        messages.map(async msg => {
                            const metaData = JSON.parse(Utils.decodeBase64(msg.messageText)).datasets[0];
                            await this.setUpStorage(metaData.data.tenant);
                            await this.polling(msg);
                        })
                    );
                } else {
                    await Utils.sleep(Config.SDMS_VERSION_SYNC_INTERVAL);
                }
            }
        } catch (error) {
            throw Error.makeForHTTPRequest(error);
        }
    }

    async setUpStorage(dataPartition: string) {
        if (!this.databaseContainer) {
            this.databaseContainer = await this.connectDBClient(dataPartition);
        }
        if (!this.storage) {
            this.storage = StorageFactory.build(Config.CLOUD_PROVIDER, {
                dataPartition: dataPartition,
            });
        }
    }

    public async connectDBClient(dataPartition: string): Promise<Container> {
        const database = DatabaseFactory.build(Config.CLOUD_PROVIDER, { dataPartition: dataPartition });
        return await database.getDBContainer();
    }

    public async storeMetadata(data) {
        try {
            if (this.databaseContainer) {
                await this.databaseContainer.items.upsert(data);
            }
        } catch (error) {
            console.log(error);
        }
    }

    async polling(msg) {
        const msgContent = JSON.parse(Utils.decodeBase64(msg.messageText));
        this.logger.trackTrace(
            `Sync V3V4 - Successfully fetched message: ${msg.messageId}, content: ${JSON.stringify(
                msgContent.datasets[0].data
            )}`
        );
        if (!msgContent.datasets[0].data.filemetadata) {
            // Store initial 'empty' dataset
            await this.storeMetadata(msgContent.datasets[0].data);
            this.logger.trackTrace(
                `Sync V3V4 - Stored an initial v3 record to cosmosDB, record id: ${msgContent.datasets[0].data.id}`
            );
            const containerId = Utils.getContainerIdFromGcsurl(msgContent.datasets[0].id);
            const metadata = await this.computeFilemetadata(containerId);
            if (metadata) {
                // Update the message with new timestamp and current file metadata
                msgContent.datasets[0].data.filemetadata = metadata;
                msgContent.time = new Date();
                const encodedContent = btoa(JSON.stringify(msgContent));
                await this.queue.updateMessage(
                    Config.SDMS_V3_V4_SYNC_QUEUE,
                    msg.messageId,
                    msg.popReceipt,
                    encodedContent,
                    30
                );
            } else {
                await this.queue.deleteMessage(Config.SDMS_V3_V4_SYNC_QUEUE, msg.messageId, msg.popReceipt);
                this.logger.trackTrace(
                    `Sync V3V4 - Failed to compute initial file metadata, deleting message ${msg.messageId}`
                );
            }
        } else {
            const interval = new Date().getTime() - new Date(msgContent?.time).getTime();
            if (msgContent?.time && interval < this.POLLING_INTERVAL) {
                return;
            }

            const containerId = Utils.getContainerIdFromGcsurl(msgContent.datasets[0].id);
            const newMetadata = await this.computeFilemetadata(containerId);
            if (newMetadata) {
                if (JSON.stringify(newMetadata) === JSON.stringify(msgContent.datasets[0].data.filemetadata)) {
                    // Store the final dataset
                    await this.storeMetadata(msgContent.datasets[0].data);
                    await this.queue.deleteMessage(Config.SDMS_V3_V4_SYNC_QUEUE, msg.messageId, msg.popReceipt);
                    this.logger.trackTrace(
                        `Sync V3V4 - Successfully stored a final v3 record, record id: ${msgContent.datasets[0].data.id}, deleting the message ${msg.messageId}`
                    );
                } else {
                    msgContent.datasets[0].data.filemetadata = newMetadata;
                    msgContent.time = new Date();
                    const encodedContent = btoa(JSON.stringify(msgContent));
                    this.queue.updateMessage(
                        Config.SDMS_V3_V4_SYNC_QUEUE,
                        msg.messageId,
                        msg.popReceipt,
                        encodedContent,
                        30
                    );
                }
            } else {
                await this.queue.deleteMessage(Config.SDMS_V3_V4_SYNC_QUEUE, msg.messageId, msg.popReceipt);
                this.logger.trackTrace(
                    `Sync V3V4 - Failed to compute updated file metadata, deleting message ${msg.messageId}`
                );
            }
        }
    }

    async computeFilemetadata(container) {
        const blobs = await this.storage.listBlobs(container);
        let size = 0;
        let tier = '';
        let objectNum = 0;
        blobs
            .sort((a, b) => Number(a.name) - Number(b.name))
            .forEach(blob => {
                if (blob.name !== objectNum.toString()) {
                    return null;
                }
                if (!tier) {
                    tier = blob.tier;
                }
                objectNum += 1;
                size += blob.size;
            });

        return {
            type: 'GENERIC',
            nobject: objectNum,
            size: size,
        };
    }
}
