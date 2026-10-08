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

import { LoggingWinston } from '@google-cloud/logging-winston';
import winston from 'winston';
import { AbstractLogger, LoggerFactory } from '../../logger';
import { ConfigGoogle } from './config';


const loggingWinston = new LoggingWinston();
const logger = winston.createLogger({
    level: 'info',
    transports: [
        new winston.transports.Console(),
        loggingWinston,
    ],
});

@LoggerFactory.register('google')
export class Logger extends AbstractLogger {

    public info(data: any): void {
        if (!ConfigGoogle.UTEST) { logger.info(data); }
    }
    public error(data: any): void {
        if (!ConfigGoogle.UTEST) { logger.error(data); }
    }

    // [TODO] this method should report a metric using CSP SDK
    public metric(key: string, data: any): void {
        return;
    }
}
