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

import { Config, ReadinessFactory } from '../../cloud';
import { Error, Response } from '../../shared';

import { Operation } from './operations';
import express from 'express';

export class StatusHandler {
    public static async handler(res: express.Response, op: Operation) {
        try {
            if (op === Operation.Status) {
                Response.writeOK(res, { status: 'running' });
            } else if (op === Operation.Readiness) {
                if (await ReadinessFactory.build(Config.CLOUD_PROVIDER).handleReadinessCheck()) {
                    Response.writeOK(res, { ready: true });
                } else {
                    Response.writeError(res, Error.make(Error.Status.NOT_AVAILABLE, String({ ready: false })));
                }
            } else {
                throw Error.make(Error.Status.UNKNOWN, 'Internal Server Error');
            }
        } catch (error) {
            console.log(error);
            Response.writeError(res, error);
        }
    }
}
