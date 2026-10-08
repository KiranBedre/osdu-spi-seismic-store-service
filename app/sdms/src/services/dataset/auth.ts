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

import { DatasetModel } from '.';
import { AuthRoles } from '../../auth';
import { Config } from '../../cloud';
import { Error } from '../../shared';
import { SubProjectModel } from '../subproject';

export class DatasetAuth {

    // Return the dataset's authorization groups
    public static getAuthGroups(
        subproject: SubProjectModel, dataset: DatasetModel, role: AuthRoles, esd: string): string[] {
        let result: string[] = [];
        if (subproject.access_policy === Config.UNIFORM_ACCESS_POLICY) {
            result = role === AuthRoles.viewer ? subproject.acls.viewers.concat(
                subproject.acls.admins) : subproject.acls.admins;
        } else if (subproject.access_policy === Config.DATASET_ACCESS_POLICY) {
            if (dataset.acls) {
                result = role === AuthRoles.viewer ? dataset.acls.viewers.concat(
                    dataset.acls.admins) : dataset.acls.admins;
            } else {
                result = role === AuthRoles.viewer ? subproject.acls.viewers.concat(
                    subproject.acls.admins) : subproject.acls.admins;
            }
        } else {
            throw (Error.make(Error.Status.PERMISSION_DENIED,
                'Access policy is neither uniform nor dataset'));
        }
        return result.concat(Config.FULL_DATA_ACCESS_GROUP + '@' + esd)
    }

}