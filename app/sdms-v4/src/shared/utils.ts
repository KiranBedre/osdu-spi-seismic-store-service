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
import fs from 'fs';

// Swagger UI's data-definitions $refs are fetched over the network from
// community.opengroup.org at runtime. A degraded remote once made the underlying
// JsonRefs.resolveRefsAt call hang ~169s, which — when this ran on the port-bind path —
// blew the 155s startupProbe and got the pod SIGKILLed. This resolution is now invoked OFF
// the bind path (see server-start.ts); the timeout below is defense in depth so a
// slow/hanging remote can never wedge the resolver indefinitely.
const SWAGGER_RESOLUTION_TIMEOUT_MS = 30000;

export class Utils {
    public static async resolveJsonReferences(
        location: string,
        timeoutMs: number = SWAGGER_RESOLUTION_TIMEOUT_MS
    ): Promise<object> {
        JsonRefs.clearCache();
        // Keep resolving both relative and remote refs so Swagger UI renders exactly as before.
        const resolution = JsonRefs.resolveRefsAt(location, {
            filter: ['relative', 'remote'],
            loaderOptions: {
                processContent(res: any, callback: any) {
                    callback(null, JsYaml.load(res.text));
                },
            },
            resolveCirculars: true,
        }).then(result => result.resolved);

        let timer: NodeJS.Timeout | undefined;
        const timeout = new Promise<never>((_, reject) => {
            timer = setTimeout(
                () => reject(new Error(`swagger ref resolution timed out after ${timeoutMs}ms`)),
                timeoutMs
            );
        });

        try {
            return await Promise.race([resolution, timeout]);
        } catch (error) {
            console.error('- Failed to resolve swagger ui references; serving unresolved document', error);
            try {
                return (JsYaml.load(fs.readFileSync(location, 'utf8')) as object) ?? {};
            } catch {
                return {};
            }
        } finally {
            if (timer) {
                clearTimeout(timer);
            }
        }
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
