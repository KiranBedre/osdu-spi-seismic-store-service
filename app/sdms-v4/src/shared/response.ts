// ============================================================================
// Copyright 2017-2022, Schlumberger
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

import { Config } from '../cloud';
import { Response as expResponse } from 'express';
import xssfilters from 'xss-filters';

export class Response {
    public static writeOK(res: expResponse, data: any = {}, code = 200): void {
        this.write(res, code, data);
    }

    public static writeError(res: expResponse, err: any): void {
        if (err) {
            const code =
                typeof err.error === 'object' && typeof err.error.code === 'number'
                    ? err.error.code
                    : typeof err.code === 'number'
                    ? err.code
                    : 500;
            const message =
                typeof err.error === 'object' && typeof err.error.message === 'string'
                    ? err.error.message
                    : typeof err.message === 'string'
                    ? err.message
                    : err;
            console.error(JSON.stringify(err));
            this.write(res, code < 100 ? 500 : code, message);
        } else {
            console.error('Internal Server Error: Unexpected Error');
            this.write(res, 500, 'Internal Server Error');
        }
    }

    public static write(res: expResponse, code: number, data: any = {}): void {
        const headers = {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            Expires: '0',
            'Service-Provider': Config.CLOUD_PROVIDER,
            'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
            'X-Content-Type-Options': 'nosniff',
            'X-Frame-Options': 'DENY',
            'X-XSS-Protection': '1',
        };
        headers[Config.CORRELATION_ID] = res.locals[Config.CORRELATION_ID];
        res.set(headers)
            .status(code)
            .send(JSON.parse(xssfilters.inHTMLData(JSON.stringify(data))));
    }
}
