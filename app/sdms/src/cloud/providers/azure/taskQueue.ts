// ============================================================================
// Copyright 2017-2023, Microsoft
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

import { TaskQueueFactory, AbstractTaskQueue, ITaskQueue } from '../../taskQueue';
import {QueueClient, QueueServiceClient} from '@azure/storage-queue';
import {DefaultAzureCredential} from '@azure/identity';
import {IOperation, IOperationQueueTask} from '../../../services/operation/model';
import {operations} from '../../../services/operation/register';
import {AzureConfig} from './config';

@TaskQueueFactory.register('azure')
export class AzureTaskQueue extends AbstractTaskQueue {
    private queueClientFactory: CachingQueueClientFactory = new CachingQueueClientFactory();

    public async pushTask(operation: IOperationQueueTask): Promise<void> {
        const queueName= operations[operation.type].getQueueName();
        delete operation.type;
        const queueClient = await this.queueClientFactory.getCachedQueueClient(queueName);

        // The message should be XML-safe, see:
        // https://learn.microsoft.com/en-us/rest/api/storageservices/put-message
        // The simple and recommended way to do it is to just base64-encode it.
        const message = this.base64encode(JSON.stringify(operation));

        await queueClient.sendMessage(message);
    }

    private base64encode(content: string): string {
        return Buffer.from(content).toString("base64");
    }
}

class CachingQueueClientFactory {
    private queueServiceClient: QueueServiceClient = null;
    private static queueClientCache: { [key: string]: QueueClient; } = {};

    public async getCachedQueueClient(queueName: string): Promise<QueueClient> {
        if (!this.queueServiceClient) {
            this.queueServiceClient = new QueueServiceClient(
                AzureConfig.AZURE_STORAGE_QUEUE_ENDPOINT,
                new DefaultAzureCredential());
        }

        if (!CachingQueueClientFactory.queueClientCache[queueName]) {
            const queueClient = this.queueServiceClient.getQueueClient(queueName);
            await queueClient.createIfNotExists();
            CachingQueueClientFactory.queueClientCache[queueName] = queueClient;
        }

        return CachingQueueClientFactory.queueClientCache[queueName];
    }
}

