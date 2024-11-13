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

import { Config, QueueFactory } from './cloud';
import { Error, Utils } from './shared';

export class VersionSyncService {
    public static async syncService() {
        try {
            const taskQueue = QueueFactory.build(Config.CLOUD_PROVIDER);
            // eslint-disable-next-line no-constant-condition
            while (true) {
                const messages = await taskQueue.fetchMessage(Config.SDMS_V3_V4_SYNC_QUEUE);
                if (messages.length > 0) {
                    await Promise.all(
                        messages.map(async msg => {
                            await taskQueue.deleteMessage(Config.SDMS_V3_V4_SYNC_QUEUE, msg.messageId, msg.popReceipt);
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
}
