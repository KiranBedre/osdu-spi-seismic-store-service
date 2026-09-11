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

import { SharedCache, Utils } from '../shared';
import { Config } from '../cloud/config';
import type { Server } from './server';
import path from 'path';

// Bind the port FIRST, before touching swagger. Swagger UI is documentation-only and its
// data-definitions $refs are fetched at runtime from community.opengroup.org; resolving them
// here (as this used to) put a blocking network call on the bind path, and a degraded remote
// hung it ~169s — past the 155s startupProbe — so kubelet SIGKILLed the pod. A try/catch would
// not have helped: a hang never throws in time. Keeping resolution strictly off the bind path
// is the fix, so a down/slow remote can never delay the listener or crashloop the service.
export function startServerAndResolveSwaggerInBackground(server: Server): void {
    server.start();

    console.log(`- Initializing swagger ui in the background`);
    Utils.resolveJsonReferences(path.join(__dirname, '..', 'docs', 'openapi.yaml'))
        .then(swaggerDocument => {
            server.setSwaggerDocument(swaggerDocument);
            console.log('- Swagger ui initialized');
        })
        .catch(error => {
            console.error('- Swagger ui initialization failed; service continues without it', error);
        });
}

async function ServerStart() {
    try {
        console.log('- Initializing cloud provider');
        Config.setCloudProvider(process.env.CLOUD_PROVIDER);

        console.log('- Initializing ' + Config.CLOUD_PROVIDER + ' Configurations');
        await Config.initialize();

        console.log('- Initializing shared cache');
        await SharedCache.init();

        console.log(`- Initializing header forwarding`);
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const hpropagate = require('hpropagate');
        Config.CALLER_FORWARD_HEADERS
            ? hpropagate({
                  headersToPropagate: Config.CALLER_FORWARD_HEADERS.split(','),
              })
            : hpropagate();

        const server = new (await import('./server')).Server();
        startServerAndResolveSwaggerInBackground(server);
    } catch (error) {
        console.error(error);
        process.exit(1);
    }
}

if (require.main === module) {
    ServerStart();
}
