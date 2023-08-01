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

import { AuthRoles } from '../../auth';
import { Config } from '../../cloud';
import { SubProjectModel } from '../subproject';

export class SubprojectAuth {

    // Return the subproject's authorization groups
    public static getAuthGroups(
        subproject: SubProjectModel, role: AuthRoles): string[] {
        return role === AuthRoles.viewer ? subproject.acls.viewers.concat(
            subproject.acls.admins.concat(Config.FULL_DATA_ACCESS_GROUP)) : subproject.acls.admins.concat(
                Config.FULL_DATA_ACCESS_GROUP);
    }

}