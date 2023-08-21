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

import { Request as expRequest } from 'express';

import { SubProjectModel } from '.';
import { Config } from '../../cloud';
import { SeistoreFactory } from '../../cloud/seistore';
import { Error, Params, Utils } from '../../shared';
import { ISubprojectAcl } from './model';

export class SubProjectParser {

    public static async create(req: expRequest): Promise<SubProjectModel> {

        const subproject = {} as SubProjectModel;
        subproject.name = req.params.subprojectid;
        subproject.tenant = req.params.tenantid;
        subproject.ltag = req.headers.ltag as string;

        // If not specified, set the acl as empty array. A default acl group will be later created for these.
        subproject.acls = req.body?.acls || { 'admins': [], 'viewers': [] };
        if (req.body?.acl) {
            const aclKeys = Object.keys(req.body.acls);
            subproject.acls['admins'] = ('admins' in aclKeys) ? subproject.acls['admins'].sort() : [];
            subproject.acls['viewers'] = ('viewers' in aclKeys) ? subproject.acls['viewers'].sort() : [];
        }

        // set the dataset level access acl (uniform by default)
        subproject.access_policy = req.body?.access_policy || Config.UNIFORM_ACCESS_POLICY;


        // check user input params
        Params.checkString(subproject.admin, 'admin', false);
        Params.checkString(subproject.ltag, 'ltag', false);

        if (Config.USER_ID_HEADER_KEY_NAME) {
            subproject.admin = req.get(Config.USER_ID_HEADER_KEY_NAME)
        } else {
            subproject.admin = await Utils.getUserId(
                req.headers.authorization);
        }

        // This method is temporary required by slb during the migration of sauth from v1 to v2
        // The method replace slb.com domain name with delfiserviceaccount.com
        // Temporary hardcoded can be removed on 01/22 when sauth v1 will be dismissed.
        // Others service domain won't be affected by this call
        subproject.admin = subproject.admin ? Utils.checkSauthV1EmailDomainName(subproject.admin) : subproject.admin;

        // check if the subproject name is in the correct form
        if (!subproject.name.match(/^[a-z][a-z\d\-]*[a-z\d]$/g)) {
            throw (Error.make(Error.Status.BAD_REQUEST,
                'The subproject name (' + subproject.name + ') ' +
                'does not match the required pattern [a-z][a-z\\d\\-]*[a-z\\d]'));
        }

        // check policy corectness
        this.checkAccessPolicy(req.body);

        // check extra requirements
        SeistoreFactory.build(Config.CLOUDPROVIDER).checkExtraSubprojectCreateParams(req.body, subproject);

        return subproject;
    }

    public static patch(req: expRequest): {
        ltag: string, access_policy: string,
        acls: ISubprojectAcl, recursive: boolean
    } {

        Params.checkString(req.query.recursive, 'recursive', false);
        Params.checkString(req.body.access_policy, 'access_policy', false);

        // [TODO:V4] Remove support for patch access policy, supported in google only, not osdu-compliant.
        if (req.body && req.body.access_policy && Config.CLOUDPROVIDER !== 'google') {
            throw (Error.make(Error.Status.BAD_REQUEST,
                'The subproject access policy cannot be patched.'));
        } else {
            // check policy corectness
            this.checkAccessPolicy(req.body);
        }

        return {
            ltag: req.get('ltag'),
            access_policy: req.body ? req.body.access_policy : undefined,
            acls: req.body ? req.body.acls : undefined,
            recursive: req.query.recursive === 'true'
        };
    }

    public static bulkDelete(req: expRequest): string {
        Params.checkString(req.query.path, 'path');
        let path = req.query.path as string;
        if (!path.endsWith('/')) {
            path += '/';
        }
        return path;
    }

    public static bulkDeleteStatus(req: expRequest): string {
        Params.checkString(req.query.operationid, 'operationid');
        return req.query.operationid as string;
    }

    private static checkAccessPolicy(req: expRequest): void {
        if (req.body && req.body.access_policy &&
            req.body.access_policy !== Config.DATASET_ACCESS_POLICY &&
            req.body.access_policy !== Config.UNIFORM_ACCESS_POLICY) {
            throw (Error.make(Error.Status.BAD_REQUEST,
                'Access_policy value has to be ' + Config.DATASET_ACCESS_POLICY +
                ' or ' + Config.UNIFORM_ACCESS_POLICY));
        }
    }

}
