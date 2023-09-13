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

import * as appinsights from 'applicationinsights';
import { AzureConfig } from './config';
import { Config } from '../../config';

export class AzureInsights {
    public static preProcessTelemetryData(
        envelope: appinsights.Contracts.EnvelopeTelemetry,
        context: { [name: string]: any }
    ): boolean {
        const eType = envelope.data.baseType;
        const eData = envelope.data.baseData;
        // Log only remote dependency data if there are failures or request if not status or readiness
        if (
            (eType === 'RemoteDependencyData' && eData.success === true) ||
            (eType === 'RequestData' && (eData.name.includes('status') || eData.name.includes('readiness')))
        ) {
            return false;
        }

        const headers = context['http.ServerRequest']?.headers;
        if (headers && appinsights.Contracts.domainSupportsProperties(eData)) {
            // Log the correlation-id
            if (headers[Config.CORRELATION_ID]) {
                eData.properties[Config.CORRELATION_ID] = headers[Config.CORRELATION_ID];
            }

            // Log requested data partition ID
            if (headers[Config.DATA_PARTITION_ID]) {
                eData.properties[Config.DATA_PARTITION_ID] = headers[Config.DATA_PARTITION_ID];
            }

            // Log the caller's id
            if (headers[Config.USER_ID_HEADER_KEY_NAME]) {
                eData.properties['user-id'] = headers[Config.USER_ID_HEADER_KEY_NAME];
            }
        }
        return true;
    }

    public static initialize() {
        if (AzureConfig.AI_INSTRUMENTATION_KEY) {
            appinsights
                .setup(AzureConfig.AI_INSTRUMENTATION_KEY)
                .setAutoDependencyCorrelation(true)
                .setAutoCollectRequests(true)
                .setAutoCollectPerformance(true, true)
                .setAutoCollectExceptions(true)
                .setAutoCollectDependencies(true)
                .setAutoCollectConsole(true)
                .setUseDiskRetryCaching(true, 30 * 1000, 2 * 104857600)
                .setDistributedTracingMode(appinsights.DistributedTracingModes.AI_AND_W3C);
            appinsights.defaultClient.context.tags[appinsights.defaultClient.context.keys.cloudRole] = 'seismic-dms-v4';
            appinsights.defaultClient.addTelemetryProcessor(this.preProcessTelemetryData);
            appinsights.start();
        }
    }

    public static trackTrace(data: any) {
        if (appinsights) {
            appinsights.defaultClient.trackTrace(data);
        }
    }
}
