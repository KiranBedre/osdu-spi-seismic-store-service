// ============================================================================
// Copyright 2017-2024, Schlumberger
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

import { QueueDeleteMessageResponse, ReceivedMessageItem } from '@azure/storage-queue';

import { CloudFactory } from './cloud';

export interface IQueue {
    fetchMessage(queue: string): Promise<ReceivedMessageItem[]>;
    deleteMessage(queue: string, messageId: string, popReceipt: string): Promise<QueueDeleteMessageResponse>;
}

export abstract class AbstractQueue implements IQueue {
    public abstract fetchMessage(queue: string): Promise<ReceivedMessageItem[]>;
    public abstract deleteMessage(
        queue: string,
        messageId: string,
        popReceipt: string
    ): Promise<QueueDeleteMessageResponse>;
}

export class QueueFactory extends CloudFactory {
    public static build(providerLabel: string): IQueue {
        return CloudFactory.build(providerLabel, AbstractQueue) as IQueue;
    }
}
