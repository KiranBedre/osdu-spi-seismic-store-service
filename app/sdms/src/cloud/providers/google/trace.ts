// ============================================================================
// Copyright 2017-2019, Schlumberger
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

import * as tracer from '@google-cloud/trace-agent';
import { AbstractTrace, TraceFactory } from '../../trace';
import { ConfigGoogle } from './config';

@TraceFactory.register('google')
export class GoogleTrace extends AbstractTrace {

    public start() {
        tracer.start({
            keyFilename: ConfigGoogle.SERVICE_IDENTITY_KEY_FILENAME,
            projectId: ConfigGoogle.SERVICE_CLOUD_PROJECT,
            ignoreUrls: [ConfigGoogle.API_BASE_PATH + '/svcstatus']
        });
    }

}
