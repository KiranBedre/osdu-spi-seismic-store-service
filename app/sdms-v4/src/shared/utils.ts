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

import JsYaml from 'js-yaml';
import JsonRefs from 'json-refs';
import crypto from 'crypto';

export class Utils {
    public static async resolveJsonReferences(location: string): Promise<object> {
        JsonRefs.clearCache();
        const result = await JsonRefs.resolveRefsAt(location, {
            filter: ['relative', 'remote'],
            loaderOptions: {
                processContent(res: any, callback: any) {
                    callback(null, JsYaml.load(res.text));
                },
            },
            resolveCirculars: true,
        });
        return result.resolved;
    }

    public static PreBearerToken(token: string): string {
        return token.startsWith('Bearer') ? token : 'Bearer ' + token;
    }

    public static constructBucketID(recordID: string) {
        return crypto.createHash('sha256').update(recordID).digest('hex').slice(0, -1);
    }

    public static generateRandomData(len: number): string {
        let id = '';
        const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < len; i++) {
            id += charset.charAt(Math.floor(Math.random() * charset.length));
        }
        return id;
    }
}
