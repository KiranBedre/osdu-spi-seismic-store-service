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

import { TenantAuth, TenantModel } from '../tenant';
import { AuthRoles } from '../../auth';
import { Config } from '../../cloud';
import { SubProjectModel } from '../subproject';

export class AnalyticsGroups {

    // Return data.manager, tenant, and subproject authorization groups
    public static getAuthGroups(
        tenant: TenantModel, subproject: SubProjectModel, role: AuthRoles): string[] {
            const tenantManagerGroups: string[] = this.getTenantManagerAuthGroups(tenant);
            const subprojectGroups: string[] = this.getSubprojectAuthGroups(subproject, role);
            return tenantManagerGroups.concat(subprojectGroups);
    }

    // Get the data.manager & tenants's authorization groups
    public static getTenantManagerAuthGroups(
        tenant: TenantModel): string[] {
            return TenantAuth.getAuthGroups(tenant).concat(Config.FULL_DATA_ACCESS_GROUP);
    }

    // subproject's authorization groups
    public static getSubprojectAuthGroups(
        subproject: SubProjectModel, role: AuthRoles): string[] {
            return role === AuthRoles.viewer ? subproject.acls.viewers.concat(
                subproject.acls.admins) : subproject.acls.admins;
    }
}
