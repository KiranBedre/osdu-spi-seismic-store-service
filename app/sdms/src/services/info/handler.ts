// ============================================================================
// Copyright 2017-2024, Schlumberger
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
import { InfoOP } from './optype';
import { InfoModel } from '.';
import { InfoParser } from './parser';

export class InfoHandler {

    // handler for the [ / ] endpoints
    public static async handler(req: expRequest, res: expResponse, op: InfoOP) {

        try {
            switch (op) {
                case InfoOP.Info:
                    const info = await this.getInfo();
                    Response.writeOK(res, { info });
                    break;
                default:
                    throw (Error.make(Error.Status.UNKNOWN, 'Internal Server Error'));
            }
        } catch (error) { Response.writeError(res, error); }
    }

    // handler to get Info
    private static async getInfo(): Promise<InfoModel> {
        const info = await InfoParser.getInfo();
        return info;
    }
}
