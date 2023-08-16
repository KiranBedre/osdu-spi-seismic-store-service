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

import { SubprojectGroups, SubProjectModel } from '.';
import { Config, IJournal } from '../../cloud';
import { Error, getInMemoryCacheInstance } from '../../shared';
import { TenantDAO } from '../tenant';

export class SubProjectDAO {

    // register a new subproject under a given Tenant Project (existence check must be done externally)
    public static async register(journalClient: IJournal, subproject: SubProjectModel) {

        const entityKey = journalClient.createKey({
            namespace: Config.SEISMIC_STORE_NS + '-' + subproject.tenant,
            path: [Config.SUBPROJECTS_KIND, subproject.name],
        });

        await journalClient.save({ data: subproject, key: entityKey });

        getInMemoryCacheInstance().set<SubProjectModel>(
            this.getCacheKey(subproject.tenant, subproject.name), subproject, 10);

    }

    // get subproject metadata (throw if not exist)
    public static async get(
        journalClient: IJournal, tenantName: string, subprojectName: string): Promise<SubProjectModel> {

        const cache = getInMemoryCacheInstance();
        const res = cache.get<SubProjectModel>(this.getCacheKey(tenantName, subprojectName));
        if (res !== undefined && res) { return res; };

        const entityKey = journalClient.createKey({
            namespace: Config.SEISMIC_STORE_NS + '-' + tenantName,
            path: [Config.SUBPROJECTS_KIND, subprojectName],
        });

        let [entity] = await journalClient.get(entityKey);

        if (!entity) {
            throw (Error.make(Error.Status.NOT_FOUND, 'The subproject ' + subprojectName +
                ' does not exist in the tenant project ' + tenantName));
        }

        // Fix for old entities that did not have a name in the metadata
        entity = entity as SubProjectModel;
        if (!entity.name) { entity.name = subprojectName; }
        if (!entity.tenant) { entity.tenant = tenantName; }
        if (entity.enforce_key === undefined) { entity.enforce_key = false; }


        // Fix entities with no ACLs
        if (!entity.acls) {
            entity.acls = await this.constructServiceGroupACLs(entity);
        }

        // Fix entities with no access policy previously set
        if (!entity.access_policy) {
            entity.access_policy = Config.UNIFORM_ACCESS_POLICY;
        }

        cache.set<SubProjectModel>(this.getCacheKey(entity.tenant, entity.name), entity, 10);

        return entity;

    }

    // get subproject metadata (throw if not exist)
    public static async delete(journalClient: IJournal, tenantName: string, subprojectName: string) {
        const entityKey = journalClient.createKey({
            namespace: Config.SEISMIC_STORE_NS + '-' + tenantName,
            path: [Config.SUBPROJECTS_KIND, subprojectName],
        });
        await journalClient.delete(entityKey);
        getInMemoryCacheInstance().delete(this.getCacheKey(tenantName, subprojectName));
    }

    // get all tenant metadata (throw if not exist)
    public static async getAll(journalClient: IJournal, tenantName: string): Promise<SubProjectModel[]> {

        const query = journalClient.createQuery(Config.SEISMIC_STORE_NS + '-' + tenantName, Config.SUBPROJECTS_KIND);

        const entities = (await journalClient.runQuery(query))[0];

        // Fix for old entities that did not have a name in the metadata
        for (const entity of entities) {
            if (!entity.name) { entity.name = entity[journalClient.KEY].name; } // was previously journalClient.KEY
            if (!entity.tenant) { entity.tenant = tenantName; }
        }
        return entities;
    }

    // get subproject metadata
    public static async list(journalClient: IJournal, tenantName: string): Promise<SubProjectModel[]> {

        const query = journalClient.createQuery(Config.SEISMIC_STORE_NS + '-' + tenantName, Config.SUBPROJECTS_KIND);

        let [entities] = await journalClient.runQuery(query);

        if (entities.length > 0) {
            // Fix for old entities that did not have a name in the metadata
            entities = entities as SubProjectModel[];
            for (const entity of entities) {
                if (!entity.name) { entity.name = entity[journalClient.KEY].name; }
                if (!entity.tenant) { entity.tenant = tenantName; }

                if (!entity.acls) {
                    entity.acls = await this.constructServiceGroupACLs(entity);
                }

            }
        }
        return entities;
    }

    // check if a subproject exists
    public static async exist(journalClient: IJournal, tenantName: string, subprojectName: string): Promise<boolean> {
        const res = getInMemoryCacheInstance().get<SubProjectModel>(this.getCacheKey(tenantName, subprojectName));
        if (res !== undefined && res) { return true; };

        const entityKey = journalClient.createKey({
            namespace: Config.SEISMIC_STORE_NS + '-' + tenantName,
            path: [Config.SUBPROJECTS_KIND, subprojectName],
        });

        const [entity] = await journalClient.get(entityKey);

        return entity !== undefined;
    }

    public static async constructServiceGroupACLs(subproject: SubProjectModel) {

        const esd = (await TenantDAO.get(subproject.tenant)).esd;

        const acls = {
            'admins': [],
            'viewers': []
        };

        acls.admins.push(SubprojectGroups.serviceAdminGroupName(subproject.tenant, subproject.name) + '@' + esd);
        acls.admins.push(SubprojectGroups.serviceEditorGroupName(subproject.tenant, subproject.name) + '@' + esd);
        acls.viewers.push(SubprojectGroups.serviceViewerGroupName(subproject.tenant, subproject.name) + '@' + esd);

        return acls;

    }

    private static getCacheKey(tenant: string, subproject: string): string {
        return 'subproject-' + tenant + '/' + subproject;
    }

}
