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

import { Error } from './error';

export class Params {
    public static checkBody(body: any, required: boolean = true) {
        if (!body && !required) {
            return;
        }

        if (!Object.keys(body).length && !required) {
            return;
        }

        if (!body && required) {
            throw Error.make(Error.Status.BAD_REQUEST, 'The·request·body·parameter·has·not·been·specified.');
        }

        if (typeof body !== 'object') {
            throw Error.make(Error.Status.BAD_REQUEST, 'The request body parameter has not been specified.');
        }

        if (!body || !Object.keys(body).length) {
            throw Error.make(Error.Status.BAD_REQUEST, 'The request body parameter has not been specified.');
        }
    }

    public static checkBodyArray(param: any, required: boolean = true) {
        this.checkBody(param, required);

        if (!Array.isArray(param)) {
            throw Error.make(Error.Status.BAD_REQUEST, `The body is in a wrong format (not an array).`);
        }
    }
}
