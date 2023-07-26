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

import { AbstractLogger, LoggerFactory } from '../../logger';
import { AzureInsights } from './insights';
import { Config } from '../../config';
import { Request } from 'express';

@LoggerFactory.register('azure')
export class AzureLogger extends AbstractLogger {
    public trackRequest(req: Request): void {
        AzureInsights.trackTrace({
            message: '[' + req.method + '] ' + req.url,
            properties: {
                'correlation-id': req.headers[Config.CORRELATION_ID],
                'data-partition-id': req.headers[Config.DATA_PARTITION_ID],
            },
        });
    }
}
