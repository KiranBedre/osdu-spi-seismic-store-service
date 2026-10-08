// ============================================================================
// Copyright 2017-2021, Schlumberger
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

import axios from 'axios';
import { lockerInstance } from '../services/dataset/locker';

export class ErrorModel {
    public error: {
        code: number,
        message: string,
        status: string,
    };
}

export class Error {

    public static Status = {
        ALREADY_EXISTS: 409,
        BAD_REQUEST: 400,
        LOCKED: 423,
        NOT_FOUND: 404,
        PERMISSION_DENIED: 403,
        UNAUTHENTICATED: 401,
        UNKNOWN: 500,
        NOT_IMPLEMENTED: 501,
        NOT_AVAILABLE: 503
    };


    public static make(errorCode: number, message: string, mexPrefix: string = '[seismic-store-service]'): ErrorModel {
        return {
            error: {
                code: errorCode,
                message: mexPrefix + ' ' + message,
                status: this.getKeyByValue(errorCode) || 'UNKNOWN',
            },
        };
    }

    public static makeForHTTPRequest(error: any, mexPrefix: string = '[seismic-store-service]'): ErrorModel {
        if (axios.isAxiosError(error)) {
            if (typeof error.response.data === 'string' && error.response.data !== null) {
                return this.make(error.response.status, error.response.statusText + ', '
                    + error.response.data, mexPrefix)
            } else if (typeof error.response.data === 'object' && error.response.data !== null) {
                return this.make(error.response.status, JSON.stringify(error.response.data), mexPrefix)
            }
            return this.make(error.response.status, error.response.statusText, mexPrefix)
        } else if (typeof error === 'object' && error.name === 'StatusCodeError') {
            return this.make(
                error.statusCode || 500,
                typeof error.error === 'object' ? error.error.message || error.message : error.message || error,
                mexPrefix);
        } else {
            return this.make(500, error, mexPrefix);
        }
    }

    private static getKeyByValue(value: number) {
        return Object.keys(this.Status).find((key) => this.Status[key] === value);
    }

    // ---------------------------------------
    // Error code 423 Reason
    // ---------------------------------------

    private static Reason423 = {
        WRITE_LOCK: 'WL',
        READ_LOCK: 'RL',
        CANNOT_LOCK: 'CL',
        CANNOT_UNLOCK: 'CU'
    }

    private static create423Reason(stringCode: string, ttl: number): string {
        return '[RCODE:' + stringCode + ttl + ']';
    }

    public static get423WriteLockReason(): string {
        return this.create423Reason(this.Reason423.WRITE_LOCK, lockerInstance.getWriteLockTTL());
    }

    public static get423ReadLockReason(): string {
        return this.create423Reason(this.Reason423.READ_LOCK, lockerInstance.getReadLockTTL());
    }

    public static get423CannotLockReason(): string {
        return this.create423Reason(this.Reason423.CANNOT_LOCK, lockerInstance.getMutexTTL());
    }

    public static get423CannotUnlockReason(): string {
        return this.create423Reason(this.Reason423.CANNOT_UNLOCK, lockerInstance.getMutexTTL())
    }

}
