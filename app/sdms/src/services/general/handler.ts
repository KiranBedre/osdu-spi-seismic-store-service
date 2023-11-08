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

import { Request as expRequest, Response as expResponse } from 'express';
import { Error, Response } from '../../shared';
import { GeneralOP } from './optype';
import { Config } from '../../cloud';
import { SeistoreFactory } from '../../cloud/seistore';
import { DatasetOP } from '../dataset/optype';
import { Key } from '@google-cloud/datastore';

export class GeneralHandler {

    // handler for the [ /svcstatus ] endpoints
    public static async handler(req: expRequest, res: expResponse, op: GeneralOP) {

        try {
            switch (op) {
                case GeneralOP.Status:
                    Response.writeOK(res, 'service OK');
                    break;
                case GeneralOP.Access:
                    Response.writeOK(res, { status: 'running' });
                    break;
                case GeneralOP.Readiness:
                    if (await SeistoreFactory.build(Config.CLOUDPROVIDER).handleReadinessCheck()) {
                        Response.writeOK(res, { ready: true });
                    } else {
                        Response.writeError(res,
                        Error.make(Error.Status.NOT_AVAILABLE, String({ ready: false })));
                    }
                    break;
                default:
                    throw (Error.make(Error.Status.UNKNOWN, 'Internal Server Error'));
            }
        } catch (error) { Response.writeError(res, error); }
    }
}
