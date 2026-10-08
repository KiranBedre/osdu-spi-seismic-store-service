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

import axios, { AxiosError } from 'axios';

export interface ErrorModel {
    error: {
        code: number;
        message: string;
        status: string;
    };
}

export class Error {
    public static Status = {
        BAD_REQUEST: 400,
        NOT_FOUND: 404,
        PERMISSION_DENIED: 403,
        UNAUTHENTICATED: 401,
        UNKNOWN: 500,
        NOT_IMPLEMENTED: 501,
        NOT_AVAILABLE: 503,
    };

    public static make(code: number, message: string, messagePrefix = '[sddms-service]'): ErrorModel {
        return {
            error: {
                code,
                message: messagePrefix + ' ' + message,
                status: this.getKeyByValue(code) || 'UNKNOWN',
            },
        } as ErrorModel;
    }

    private static getKeyByValue(value: number): string | undefined {
        return Object.keys(this.Status).find(key => this.Status[key as keyof typeof Error.Status] === value);
    }

    public static makeForHTTPRequest(error: any, mexPrefix: string = '[seismic-store-service]'): ErrorModel {
        if (axios.isAxiosError(error)) {
            const err = error as AxiosError;
            return this.make(
                err.response?.status || 500,
                err.response
                    ? typeof err.response?.data === 'object'
                        ? (err.response?.data as any).message
                        : err.response?.data
                    : err.message,
                mexPrefix
            );
        }

        if (typeof error === 'object' && error.name === 'StatusCodeError') {
            return this.make(
                error.statusCode || 500,
                typeof error.error === 'object' ? error.error.message || error.message : error.message || error,
                mexPrefix
            );
        } else {
            return this.make(500, error, mexPrefix);
        }
    }
}
