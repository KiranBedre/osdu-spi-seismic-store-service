// ============================================================================
// Copyright 2017-2024, Schlumberger
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

import { AbstractQueue, QueueFactory } from '../../queue';
import {
    MessagesDequeueOptionalParams,
    QueueClient,
    QueueDeleteMessageResponse,
    QueueServiceClient,
    ReceivedMessageItem,
} from '@azure/storage-queue';

import { AzureConfig } from './config';
import { DefaultAzureCredential } from '@azure/identity';
import { Error } from '../../../shared';

@QueueFactory.register('azure')
export class AzureMessageQueue extends AbstractQueue {
    private queueClientFactory: CachingQueueClientFactory = new CachingQueueClientFactory();
    private queueClient: QueueClient;

    public async fetchMessage(queue: string): Promise<ReceivedMessageItem[]> {
        try {
            if (!this.queueClient) {
                await this.connectToQueueClient(queue);
            }
            const config: MessagesDequeueOptionalParams = {
                numberOfMessages: AzureConfig.AZURE_MAX_MESSAGE_NUMBER,
            };
            const response = await this.queueClient.receiveMessages(config);
            const messages = response.receivedMessageItems;
            return messages;
        } catch (error) {
            throw Error.makeForHTTPRequest(error);
        }
    }

    public async deleteMessage(
        queue: string,
        messageId: string,
        popReceipt: string
    ): Promise<QueueDeleteMessageResponse> {
        try {
            if (!this.queueClient) {
                await this.connectToQueueClient(queue);
            }
            return await this.queueClient.deleteMessage(messageId, popReceipt);
        } catch (error) {
            throw Error.makeForHTTPRequest(error);
        }
    }

    public async connectToQueueClient(queue: string) {
        this.queueClient = await this.queueClientFactory.getCachedQueueClient(queue);
    }
}

export class CachingQueueClientFactory {
    private queueServiceClient: QueueServiceClient = null;
    private static queueClientCache: { [key: string]: QueueClient } = {};

    public async getCachedQueueClient(queueName: string): Promise<QueueClient> {
        if (!this.queueServiceClient) {
            this.queueServiceClient = new QueueServiceClient(
                AzureConfig.AZURE_STORAGE_QUEUE_ENDPOINT,
                new DefaultAzureCredential()
            );
        }

        if (!CachingQueueClientFactory.queueClientCache[queueName]) {
            const queueClient = this.queueServiceClient.getQueueClient(queueName);
            await queueClient.createIfNotExists();
            CachingQueueClientFactory.queueClientCache[queueName] = queueClient;
        }

        return CachingQueueClientFactory.queueClientCache[queueName];
    }
}
