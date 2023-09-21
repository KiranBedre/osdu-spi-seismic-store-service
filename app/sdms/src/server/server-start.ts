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

// tslint:disable: no-console
import { Config, ConfigFactory, LoggerFactory, TraceFactory } from '../cloud';
import { StorageJobManager } from '../cloud/shared/queue';
import { Locker } from '../services/dataset/locker';
import { SchemaManagerFactory } from '../services/dataset/schema-manager';
import { Feature, FeatureFlags, cacheShared } from '../shared';
import { DeleteJobRedisStore } from '../services/dataset/redis';
import { SwaggerManager } from './swagger-manager';

async function ServerStart() {

    process.on('unhandledRejection', (reason, promise) => {
        const mex = 'Unhandled rejection caught at ' + promise + ' due to reason ' + reason;
        Config.CLOUDPROVIDER ? LoggerFactory.build(Config.CLOUDPROVIDER).error(mex) : console.error(mex);
    });

    try {

        console.log('- Initializing cloud provider');
        Config.setCloudProvider(process.env.CLOUDPROVIDER);

        console.log('- Initializing ' + Config.CLOUDPROVIDER + ' configurations');
        await ConfigFactory.build(Config.CLOUDPROVIDER).init();

        console.log('- Initializing redis locker cache');
        await Locker.init();

        console.log('- Initializing redis shared cache');
        await cacheShared.init(
            Config.REDIS_SHARED_INSTANCE_ADDRESS,
            Config.REDIS_SHARED_INSTANCE_PORT,
            Config.REDIS_SHARED_INSTANCE_KEY,
            Config.REDIS_SHARED_INSTANCE_TLS_DISABLE,
            'sdms-shared-cache');

        console.log('- Initializing deletion job redis');
        await DeleteJobRedisStore.init({
            ADDRESS: Config.REDIS_SHARED_INSTANCE_ADDRESS,
            PORT: Config.REDIS_SHARED_INSTANCE_PORT,
            KEY: Config.REDIS_SHARED_INSTANCE_KEY,
            DISABLE_TLS: Config.REDIS_SHARED_INSTANCE_TLS_DISABLE
        });

        console.log('- Initializing storage transfer daemon');
        StorageJobManager.setup({
            ADDRESS: Config.LOCKSMAP_REDIS_INSTANCE_ADDRESS,
            PORT: Config.LOCKSMAP_REDIS_INSTANCE_PORT,
            KEY: Config.LOCKSMAP_REDIS_INSTANCE_KEY,
            DISABLE_TLS: Config.LOCKSMAP_REDIS_INSTANCE_TLS_DISABLE
        });

        if (FeatureFlags.isEnabled(Feature.TRACE)) {
            // tslint:disable-next-line
            console.log('- Initializing cloud tracer');
            TraceFactory.build(Config.CLOUDPROVIDER).start();
        }

        console.log('- Initializing schema managers');
        await SchemaManagerFactory.initialize();

        console.log('- Initializing swagger-doc manager');
        await SwaggerManager.init();

        console.log('- Initializing caller header forwarding');
        const callerHeadersToForward = Config.CALLER_FORWARD_HEADERS ? Config.CALLER_FORWARD_HEADERS.split(',') : [];
        callerHeadersToForward.push('x-correlation-id');
        callerHeadersToForward.push('traceparent');
        if (Config.CORRELATION_ID) { callerHeadersToForward.push(Config.CORRELATION_ID); }
        require('hpropagate')({
            setAndPropagateCorrelationId: false,
            headersToPropagate: callerHeadersToForward
        });

        await new (await import('./server')).Server().start();

    } catch (error) {
        // tslint:disable-next-line
        LoggerFactory.build(Config.CLOUDPROVIDER).error(JSON.stringify(error));
        process.exit(1);
    }

}

// tslint:disable-next-line: no-floating-promises no-console
ServerStart().catch((error) => { LoggerFactory.build(Config.CLOUDPROVIDER).error(JSON.stringify(error)); });
