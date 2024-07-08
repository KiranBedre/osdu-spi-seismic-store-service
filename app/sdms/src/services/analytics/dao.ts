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

import { Config, IJournal } from '../../cloud';
import { JobModel } from '.';

export class AnalyticsDAO {

    // register a new job under a given Tenant Project (existence check must be done externally)
    public static async create(journalClient: IJournal, tenantId: string, job: JobModel) {

        const entityKey = journalClient.createKey({
            namespace: Config.SEISMIC_STORE_NS + '-' + tenantId,
            path: [Config.ANALYTIC_KIND, job.name],
        });

        await journalClient.save({ data: job, key: entityKey });
    }

    // get jobs metadata (throw if not exist)
    public static async delete(journalClient: IJournal, tenantName: string, subprojectName: string) {
        const entityKey = journalClient.createKey({
            namespace: Config.SEISMIC_STORE_NS + '-' + tenantName,
            path: [Config.ANALYTIC_KIND, subprojectName],
        });
        await journalClient.delete(entityKey);
    }

    // get all jobs metadata
    public static async list(journalClient: IJournal, tenantName: string): Promise<JobModel[]> {

        const query = journalClient.createQuery(Config.SEISMIC_STORE_NS + '-' + tenantName, Config.ANALYTIC_KIND);

        const [entities] = await journalClient.runQuery(query);
        return entities;
    }

}
