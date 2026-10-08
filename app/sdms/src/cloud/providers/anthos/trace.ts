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

import { AbstractTrace, TraceFactory } from '../../trace';
import express from 'express'
import promMid from 'express-prometheus-middleware'
import { Config } from '../../config';

@TraceFactory.register('anthos')
export class AnthosTrace extends AbstractTrace {

    public start(app: express.Express) {
        /**
         * A metrics endpoint is set to be consumed from Prometheus
         */
        const metricsMiddleware = promMid({
            metricsPath: `${Config.API_BASE_PATH}/metrics`,
            collectDefaultMetrics: true,
            requestDurationBuckets: [0.1, 0.5, 1, 1.5],
            requestLengthBuckets: [512, 1024, 5120, 10240, 51200, 102400],
            responseLengthBuckets: [512, 1024, 5120, 10240, 51200, 102400],
            transformLabels: (labels, req) => {
                if(labels.route.startsWith('/api/seismic-store/v3')) {
                    labels.route = labels.route.replace('/api/seismic-store/v3', '');
                }
                return labels;
            }
        });
        app.use(metricsMiddleware)
    }
}
