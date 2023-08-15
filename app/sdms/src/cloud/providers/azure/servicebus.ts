// ============================================================================
// Copyright 2017-2023, Schlumberger
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

import { ServiceBusClient, ServiceBusMessage  } from '@azure/service-bus';
import { DefaultAzureCredential } from '@azure/identity';
import { AbstractJournal, AbstractJournalTransaction, IJournalQueryModel, IJournalTransaction, JournalFactory } from '../../journal';
import { AzureConfig } from './config';

@JournalFactory.register('azure')
export class ServiceBusDAO {

    private credential: DefaultAzureCredential;

    public constructor() {
        this.credential = new DefaultAzureCredential();
    }

    public async sendServiceBusMessage(message: string) {
        const sbClient = new ServiceBusClient(AzureConfig.SERVICE_BUS_NAMESPACE, this.credential);
        const sender = sbClient.createSender(AzureConfig.SERVICE_BUS_QUEUE_NAME);

        const messages: ServiceBusMessage[] = [
            { body: message }
        ];

        try {
            await sender.sendMessages(messages);
        } finally {
            await sbClient.close();
        }
    }
}
