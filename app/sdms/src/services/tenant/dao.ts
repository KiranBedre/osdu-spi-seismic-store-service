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

import { TenantModel } from '.';
import { Config, JournalFactoryServiceClient } from '../../cloud';
import { DESUtils } from '../../dataecosystem';
import { Error, getInMemoryCacheInstance } from '../../shared';

export class TenantDAO {

    // get tenant metadata (throw if not exist)
    public static async get(tenantName: string): Promise<TenantModel> {

        const cache = getInMemoryCacheInstance();
        const res = cache.get<TenantModel>(this.getCacheKey(tenantName));
        if (res !== undefined && res) {
            Config.DATA_PARTITION_ID = DESUtils.getDataPartitionID(res.esd);
            return res;
        };

        const serviceClient = JournalFactoryServiceClient.get(
            Config.TENANT_JOURNAL_ON_DATA_PARTITION ? {
                name: tenantName,
                esd: tenantName + '.domain.com',
                default_acls: tenantName,
                gcpid: tenantName
            } : undefined);

        const key = serviceClient.createKey({
            namespace: Config.ORGANIZATION_NS,
            path: [Config.TENANTS_KIND, tenantName],
        });

        let [entity] = await serviceClient.get(key);

        if (!entity) {
            throw (Error.make(Error.Status.NOT_FOUND, 'The tenant project ' + tenantName + ' does not exist'));
        }

        // Fix for old entities that did not have a name in the metadata
        entity = entity as TenantModel;
        if (!entity.name) { entity.name = tenantName; }

        cache.set<TenantModel>(this.getCacheKey(tenantName), entity, 3600);

        Config.DATA_PARTITION_ID = DESUtils.getDataPartitionID(entity.esd);

        return entity;

    }

    // get all tenant metadata (throw if not exist)
    public static async getAll(): Promise<TenantModel[]> {

        if (Config.TENANT_JOURNAL_ON_DATA_PARTITION) {
            throw (Error.make(Error.Status.BAD_REQUEST, 'Tenant must be provided for ' +
                'solutions having tenant\' journal deployed on client resources'));
        }

        const serviceClient = JournalFactoryServiceClient.get();

        const query = serviceClient.createQuery(Config.ORGANIZATION_NS, Config.TENANTS_KIND);

        const results = (await serviceClient.runQuery(query))[0];

        // Fix for old entities that did not have a name in the metadata
        for (const item of results) {
            if (!item.name) { item.name = item[serviceClient.KEY].name; }
        }
        return results;
    }

    // register tenant metadata
    public static async register(tenant: TenantModel): Promise<void> {

        const serviceClient = JournalFactoryServiceClient.get(
            Config.TENANT_JOURNAL_ON_DATA_PARTITION ? tenant : undefined);

        const entityKey = serviceClient.createKey({
            namespace: Config.ORGANIZATION_NS,
            path: [Config.TENANTS_KIND, tenant.name],
        });

        await serviceClient.save({ data: tenant, key: entityKey });

        getInMemoryCacheInstance().set<TenantModel>(this.getCacheKey(tenant.name), tenant, 3600);

    }

    // delete subproject metadata
    public static async delete(tenantName: string): Promise<void> {

        const serviceClient = JournalFactoryServiceClient.get(
            Config.TENANT_JOURNAL_ON_DATA_PARTITION ? {
                name: tenantName,
                esd: tenantName + '.domain.com',
                default_acls: tenantName,
                gcpid: tenantName
            } : undefined);

        await serviceClient.delete(serviceClient.createKey({
            namespace: Config.ORGANIZATION_NS,
            path: [Config.TENANTS_KIND, tenantName],
        }));
        getInMemoryCacheInstance().delete(this.getCacheKey(tenantName));
    }

    // check if a tenant exist
    public static async exist(tenant: TenantModel): Promise<boolean> {

        const cache = getInMemoryCacheInstance();
        const res = cache.get<TenantModel>(this.getCacheKey(tenant.name));
        if (res !== undefined && res) { return true; };

        const serviceClient = JournalFactoryServiceClient.get(
            Config.TENANT_JOURNAL_ON_DATA_PARTITION ? tenant : undefined);

        const [entity] = await serviceClient.get(serviceClient.createKey({
            namespace: Config.ORGANIZATION_NS,
            path: [Config.TENANTS_KIND, tenant.name],
        }));

        if (entity) {
            cache.set<TenantModel>(this.getCacheKey(entity.name), entity, 3600);
        }

        return entity !== undefined;
    }

    private static getCacheKey(tenantName: string): string {
        return 'tenant-' + tenantName;
    }

}
