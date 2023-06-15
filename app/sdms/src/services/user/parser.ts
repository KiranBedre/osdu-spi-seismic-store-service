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
import { AuthRoles } from '../../auth';
import { Error, Params, SDPath, SDPathModel } from '../../shared';

export class UserParser {

    public static removeUser(req: expRequest): { email: string, sdPath: SDPathModel } {

        const email = req.query?.email || req.body?.email;
        const path = req.query?.path  || req.body?.path;

        Params.checkString(email, 'email');
        Params.checkString(path, 'path');

        const sdPath = SDPath.getFromString(path);

        if (!sdPath) {
            throw (Error.make(Error.Status.BAD_REQUEST,
                'The \'path\' parameter is not a valid seismic store path.'));
        }

        if (!sdPath.tenant && !sdPath.subproject) {
            throw (Error.make(Error.Status.BAD_REQUEST,
                'The \'path\' parameter is neither a valid tenant or a valid subproject resource path.'));
        }

        return { email, sdPath };

    }

    public static addUser(req: expRequest): { email: string, sdPath: SDPathModel, groupRole: string } {

        Params.checkBody(req.body);
        Params.checkString(req.body.email, 'email');
        Params.checkString(req.body.path, 'path');

        const email = req.body.email;

        const sdPath = SDPath.getFromString(req.body.path);
        if (!sdPath) {
            throw (Error.make(Error.Status.BAD_REQUEST,
                'The \'path\' body parameter is not a valid seismic store path.'));
        }

        if (!sdPath.tenant && !sdPath.subproject) {
            throw (Error.make(Error.Status.BAD_REQUEST,
                'The \'path\' body parameter is neither a valid tenant or a valid subproject resource path.'));
        }

        let groupRole: string;
        if (sdPath.subproject) {
            Params.checkString(req.body.group, 'group');
            groupRole = (req.body.group as string).toLowerCase();
            if (groupRole !== AuthRoles.admin && groupRole !== AuthRoles.editor && groupRole !== AuthRoles.viewer) {
                throw (Error.make(Error.Status.BAD_REQUEST,
                    'The group body field ' + groupRole + ' ' +
                    ' must be one of [' + AuthRoles.admin + ', ' + AuthRoles.editor + ', ' + AuthRoles.viewer + ']'));
            }
        }

        return { email, sdPath, groupRole };

    }

    public static listUsers(req: expRequest): SDPathModel {

        Params.checkString(req.query.sdpath, 'sdpath');
        const sdPath = SDPath.getFromString(req.query.sdpath as string);
        if (!sdPath) {
            throw (Error.make(Error.Status.BAD_REQUEST,
                'The \'sdpath\' query parameter is not a valid seismic store path.'));
        }

        if (!sdPath.subproject) {
            throw (Error.make(Error.Status.BAD_REQUEST,
                'The \'sdpath\' query parameter is neither a valid subproject resource path.'));
        }

        return sdPath;

    }

    public static rolesUser(req: expRequest): SDPathModel {

        Params.checkString(req.query.sdpath, 'sdpath');
        const sdPath = SDPath.getFromString(req.query.sdpath as string);
        if (!sdPath) {
            throw (Error.make(Error.Status.BAD_REQUEST,
                'The \'sdpath\' query parameter is not a valid seismic store path.'));
        }

        if (!sdPath.tenant && !sdPath.subproject) {
            throw (Error.make(Error.Status.BAD_REQUEST,
                'The \'path\' body parameter is neither a valid tenant or a valid subproject resource path.'));
        }

        return sdPath;
    }

}
