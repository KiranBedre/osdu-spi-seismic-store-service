// ============================================================================
// Copyright 2017-2023, Schlumberger
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

import { AbstractReadiness, ReadinessFactory } from '../../readiness';

import { AzureConfig } from './config';
import { AzureCredentials } from './credentials';

@ReadinessFactory.register('azure')
export class AzureReadiness extends AbstractReadiness {
    public async handleReadinessCheck(): Promise<boolean> {
        try {
            const credentials = AzureCredentials.getCredential();
            const scope = AzureConfig.APP_RESOURCE_ID;
            await credentials.getToken(`${scope}/.default`);
            return true;
        } catch (error: any) {
            return false;
        }
    }
}
