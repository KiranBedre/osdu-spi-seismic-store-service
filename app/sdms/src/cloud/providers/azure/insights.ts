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
import * as appinsights from 'applicationinsights';
import { DependencyTelemetry } from 'applicationinsights/out/Declarations/Contracts';
import { Utils } from '../../../shared';
import { Config } from '../../config';
import { AbstractLogger, LoggerFactory } from '../../logger';
import { AzureConfig } from './config';

@LoggerFactory.register('azure')
export class AzureInsightsLogger extends AbstractLogger {

    public static preProcessTelemetryData(
        envelope: appinsights.Contracts.EnvelopeTelemetry, context: { [name: string]: any; }): boolean {

        const httpRequest = context['http.ServerRequest'];

        if (envelope.data.baseType === 'RemoteDependencyData') {
            // Log only remote dependency data if there are failures
            if (envelope.data.baseData.success === true) {
                return false;
            }
        }

        if (envelope.data.baseType === 'RequestData' && envelope.data.baseData.name.includes('svcstatus')) {
            return false;
        }

        if (httpRequest && appinsights.Contracts.domainSupportsProperties(envelope.data.baseData)) {

            let isSuccess:boolean = true

            // Log the correlation-id
            if (AzureConfig.CORRELATION_ID in httpRequest.headers) {
                envelope.data.baseData.properties[AzureConfig.CORRELATION_ID] =
                    httpRequest.headers[AzureConfig.CORRELATION_ID];
            }

            // Log requested data partition ID
            if (Config.DATA_PARTITION_ID) {
                envelope.data.baseData.properties['data-partition-id'] = Config.DATA_PARTITION_ID;
            }

            // Log the caller's id
            if ('authorization' in httpRequest.headers) {
                try {
                    envelope.data.baseData.properties['user-id'] = httpRequest.get(Config.USER_ID_HEADER_KEY_NAME) ||
                    Utils.getUserId(httpRequest.headers.authorization);
                } catch (e) {
                    console.error('Telemetry process error - unrecognized header format');
                    console.error(httpRequest.headers);
                    console.error(e);
                    isSuccess = false;
                }
            }

            // Log party to which the JWT was originally issued
            if ('authorization' in httpRequest.headers) {
                try {
                    const azp = Utils.getAzpFromPayload(httpRequest.headers.authorization);
                    if (azp) {
                        envelope.data.baseData.properties['azp'] = azp;
                    }
                } catch (e) {
                    console.error('Telemetry process error - unrecognized header format');
                    console.error(httpRequest.headers);
                    console.error(e);
                    isSuccess = false;
                }
            }
            return isSuccess;
        }
        return true;
    }

    public static initialize() {

        if (!Config.UTEST && AzureConfig.AI_INSTRUMENTATION_KEY) {

            appinsights.setup(AzureConfig.AI_INSTRUMENTATION_KEY)
                .setAutoDependencyCorrelation(true)
                .setAutoCollectRequests(true)
                .setAutoCollectPerformance(true, true)
                .setAutoCollectExceptions(true)
                .setAutoCollectDependencies(true)
                .setAutoCollectConsole(true)
                .setUseDiskRetryCaching(true, 30 * 1000, 2 * 104857600)
                .setDistributedTracingMode(appinsights.DistributedTracingModes.AI_AND_W3C);

            appinsights.defaultClient.context.tags[
                appinsights.defaultClient.context.keys.cloudRole] = 'seismic-dms';

            appinsights.defaultClient.addTelemetryProcessor(AzureInsightsLogger.preProcessTelemetryData);
            appinsights.start();
        }
    }



    public info(data: any): void {
        if (!Config.UTEST && AzureConfig.ENABLE_LOGGING_INFO) {
            if (AzureConfig.AI_INSTRUMENTATION_KEY) {
                appinsights.defaultClient.trackTrace({ message: JSON.stringify(data) });
            }
            // tslint:disable-next-line
            console.log(data);
        }
    }

    public error(data: any): void {
        if (!Config.UTEST && AzureConfig.ENABLE_LOGGING_ERROR) {
            if (AzureConfig.AI_INSTRUMENTATION_KEY) {
                appinsights.defaultClient.trackException({ exception: data });
            }
            // tslint:disable-next-line
            console.log(data);
        }
    }

    public metric(key: string, data: any) {
        if (!Config.UTEST && AzureConfig.ENABLE_LOGGING_METRIC) {
            if (AzureConfig.AI_INSTRUMENTATION_KEY) {
                appinsights.defaultClient.trackMetric({ name: key, value: data });
            }
            // tslint:disable-next-line
            console.log(data);
        }
    }

}