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

import { TenantGroups } from '../tenant';

export class SubprojectGroups {

    public static serviceGroupPrefix(tenantName: string, subprojectName: string): string {
        return TenantGroups.serviceGroupPrefix(tenantName) + '.' + subprojectName;
    }

    public static serviceAdminGroupName(tenant: string, subproject: string): string {
        return this.serviceGroupPrefix(tenant, subproject) + '.admin';
    }

    public static serviceEditorGroupName(tenant: string, subproject: string): string {
        return this.serviceGroupPrefix(tenant, subproject) + '.editor';
    }

    public static serviceViewerGroupName(tenant: string, subproject: string): string {
        return this.serviceGroupPrefix(tenant, subproject) + '.viewer';
    }

    public static serviceAdminGroup(tenant: string, subproject: string, esd: string): string {
        return this.serviceAdminGroupName(tenant, subproject) + '@' + esd;
    }

    public static serviceEditorGroup(tenant: string, subproject: string, esd: string): string {
        return this.serviceEditorGroupName(tenant, subproject) + '@' + esd;
    }

    public static serviceViewerGroup(tenant: string, subproject: string, esd: string): string {
        return this.serviceViewerGroupName(tenant, subproject) + '@' + esd;
    }

    public static serviceGroupNameRegExp(tenant: string, subproject: string): RegExp {
        return new RegExp(this.serviceGroupPrefix(tenant, subproject));
    }

    // ====================================================================================================

    public static dataGroupPrefix(tenant: string, subproject: string): string {
        return TenantGroups.dataGroupPrefix(tenant) + '.' + subproject;
    }

    public static dataAdminGroup(tenant: string, subproject: string, esd: string, uuid: string): string {
        return this.dataGroupPrefix(tenant, subproject) + '.' + uuid + '.admin' + '@' + esd;
    }

    public static dataViewerGroup(tenant: string, subproject: string, esd: string, uuid: string): string {
        return this.dataGroupPrefix(tenant, subproject) + '.' + uuid + '.viewer' + '@' + esd;
    }

    public static dataGroupNameRegExp(tenant: string, subproject: string): RegExp {
        return new RegExp(this.dataGroupPrefix(tenant, subproject));
    }

}
