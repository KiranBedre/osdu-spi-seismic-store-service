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

import { Config } from './cloud';
import { VersionSyncService } from './service';

async function ServerStart() {
    try {
        console.log('- Initializing cloud provider');
        Config.setCloudProvider(process.env.CLOUD_PROVIDER);

        console.log('- Initializing ' + Config.CLOUD_PROVIDER + ' Configurations');
        await Config.initialize();

        console.log('- Running ' + Config.CLOUD_PROVIDER + ' Message Queue Watcher');
        await VersionSyncService.syncService();
    } catch (error) {
        console.error(error);
        process.exit(1);
    }
}

ServerStart();
