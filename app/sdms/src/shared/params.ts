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

import { Error } from './error';

export class Params {

    // check if the body exist and is not empty
    public static checkBody(body: any, required: boolean = true) {

        if (!body && !required) { return; }

        if (!Object.keys(body).length && !required) { return; }

        if (!body && required) {
            throw (Error.make(Error.Status.BAD_REQUEST, 'The request body parameter has not been specified.'));
        }

        if (typeof body !== 'object') {
            throw (Error.make(Error.Status.BAD_REQUEST, 'The request body parameter has not been specified.'));
        }

        if (!body || !Object.keys(body).length) {
            throw (Error.make(Error.Status.BAD_REQUEST, 'The request body parameter has not been specified.'));
        }
    }

    // check if the param is a valid string
    public static checkString(param: any, fieldName: string, required: boolean = true) {
        this.checkParam(param, fieldName, required, 'string');
    }

    // check if the param is a valid object
    public static checkObject(param: any, fieldName: string, required: boolean = true) {
        this.checkParam(param, fieldName, required, 'object');
    }

    // check if the param is a valid object
    public static checkBoolean(param: any, fieldName: string, required: boolean = true) {
        this.checkParam(param, fieldName, required, 'boolean');
    }

    // check if the param is a valid array
    public static checkArray(param: any, fieldName: string, required: boolean = true) {

        if (!param && !required) { return; }

        if (!param && required) {
            throw (Error.make(
                Error.Status.BAD_REQUEST, 'The \'' + fieldName + '\' parameter has not been specified.'));
        }

        if (!Array.isArray(param)) {
            throw (Error.make(
                Error.Status.BAD_REQUEST, 'The \'' + fieldName + '\' parameter is in a wrong format.'));
        }
    }

    // check if the param is a valid email
    public static checkEmail(email: any, fieldName: string, required: boolean = true) {

        if (!email && !required) { return; }

        this.checkParam(email, fieldName, required, 'string');

        // eslint-disable-next-line @stylistic/max-len
        const regexp = new RegExp(/^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/);
        if (!regexp.test(email)) {
            throw (Error.make(
                Error.Status.BAD_REQUEST,
                'The \'' + fieldName + '\' body field value ' + email + ' is not a valid email.'));
        }

    }

    // check if dataset path is valid
    public static checkDatasetPath(path: string, fieldName: string, required: boolean = true) {

        this.checkParam(path, fieldName, required, 'string');

        if (!path.match(/^[\/A-Za-z0-9_\.-]*$/g)) {
            throw (Error.make(Error.Status.BAD_REQUEST, 'The \'' + fieldName +
                '\' parameter ' + path + ' is in a wrong format.' +
                'It should match the regex expression ^[\/A-Za-z0-9_\.-]*$'));
        }

    }

    // check the parameter
    private static checkParam(param: any, fieldName: string, required: boolean, paramType: string) {

        if (!param && !required) { return; }

        if (!param && required) {
            throw (Error.make(Error.Status.BAD_REQUEST, 'The \'' + fieldName + '\' parameter has not been specified.'));
        }

        if (typeof param !== paramType) {
            throw (Error.make(Error.Status.BAD_REQUEST, 'The \'' + fieldName + '\' parameter is in a wrong format.'));
        }

    }

}