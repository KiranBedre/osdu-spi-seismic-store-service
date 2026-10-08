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

import { JournalFactoryTenantClient } from '../../cloud';
import { Config } from '../../cloud';
import { TenantModel } from '../tenant';
import { IAppModel } from './model';

export class AppsDAO {

    public static async register(tenant: TenantModel, application: IAppModel) {

        const journalClient = JournalFactoryTenantClient.get(tenant);
        const entityKey = journalClient.createKey({
            namespace: Config.SEISMIC_STORE_NS + '-' + tenant.name,
            path: [Config.APPS_KIND, application.email],
        });
        delete application.email;
        await journalClient.save({ key: entityKey, data: application });

    }

    public static async get(tenant: TenantModel, email: string): Promise<IAppModel> {

        const journalClient = JournalFactoryTenantClient.get(tenant);
        const entityKey = journalClient.createKey({
            namespace: Config.SEISMIC_STORE_NS + '-' + tenant.name,
            path: [Config.APPS_KIND, email],
        });
        const entity = await journalClient.get(entityKey);
        return entity[0] ? {
            email: entity[0][journalClient.KEY],
            trusted: (entity[0] as IAppModel).trusted } : undefined;
    }

    public static async list(tenant: TenantModel): Promise<IAppModel[]> {

        const journalClient = JournalFactoryTenantClient.get(tenant);
        const [entities] = await journalClient.runQuery(journalClient.createQuery(
            Config.SEISMIC_STORE_NS + '-' + tenant.name, Config.APPS_KIND));
        return entities.map((e) => {
            return { email: e[journalClient.KEY].name, trusted: (e as IAppModel).trusted } as IAppModel;
        });
    }

}
