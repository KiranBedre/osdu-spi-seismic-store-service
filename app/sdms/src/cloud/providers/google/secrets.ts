// ============================================================================
// Copyright 2017-2021, Schlumberger
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

import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { Error } from '../../../shared';
import { ConfigGoogle } from './config';

export class Secrets{

    private client = new SecretManagerServiceClient({
        keyFilename: ConfigGoogle.SERVICE_IDENTITY_KEY_FILENAME,
        projectId: ConfigGoogle.SERVICE_CLOUD_PROJECT
    });

    public async getSecret(secretName: string, required = true): Promise<string> {
        try {
            // pragma: allowlist nextline secret
            const [secret] = await this.client.accessSecretVersion({
                name: `projects/${ConfigGoogle.SERVICE_CLOUD_PROJECT}/secrets/${secretName}/versions/latest`
            });
            return secret.payload.data.toString();
        } catch (error) {
            if(required) {
                throw (Error.make(Error.Status.UNKNOWN,
                    `The required "${secretName}" secret cannot be correctly retrieved from the SecretManager`));
            } else {
                return undefined;
            }
        }
    }
}