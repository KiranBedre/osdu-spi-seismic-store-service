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

import { Request as expRequest } from 'express';
import { Error, Params, SDPath, SDPathModel } from '../../shared';

export class AppParser {

    public static register(req: expRequest): { email: string, sdPath: SDPathModel } {

        Params.checkEmail(req.query.email, 'email');
        Params.checkString(req.query.sdpath, 'sdpath');

        const email = req.query.email as string;
        const sdPath = SDPath.getFromString(req.query.sdpath as string);
        if (!sdPath) {
            throw (Error.make(Error.Status.BAD_REQUEST,
                'The \'path\' body parameter is not a valid seismic store path.'));
        }

        if (!sdPath.tenant) {
            throw (Error.make(Error.Status.BAD_REQUEST,
                'The \'path\' body parameter is note a valid tenant resource path.'));
        }

        return { email, sdPath };

    }

    public static list(req: expRequest): SDPathModel {

        Params.checkString(req.query.sdpath, 'sdpath');

        const sdPath = SDPath.getFromString(req.query.sdpath as string);
        if (!sdPath) {
            throw (Error.make(Error.Status.BAD_REQUEST,
                'The \'path\' body parameter is not a valid seismic store path.'));
        }

        if (!sdPath.tenant) {
            throw (Error.make(Error.Status.BAD_REQUEST,
                'The \'path\' body parameter is note a valid tenant resource path.'));
        }

        return sdPath;

    }

}
