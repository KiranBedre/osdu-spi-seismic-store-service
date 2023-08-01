// ============================================================================
// Copyright 2017-2022, Schlumberger
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

import { DatasetModel, PaginationModel } from '.';
import { Config, IJournal } from '../../cloud';
import { AzureConfig } from '../../cloud/providers/azure';
import { Utils } from '../../shared';
import { Locker } from './locker';
import { PaginatedDatasetList } from './model';
import { AzureCosmosDbQuery } from '../../cloud/providers/azure'

export class DatasetDAO {

    public static async register(
        journalClient: IJournal, datasetEntity: { key: object, data: DatasetModel; }) {
        datasetEntity.data.ctag = Utils.makeID(16);
        await journalClient.save(datasetEntity);
    }

    public static async getByKey(journalClient: IJournal, dataset: DatasetModel): Promise<DatasetModel> {
        const datasetEntityKey = journalClient.createKey({
            namespace: Config.SEISMIC_STORE_NS + '-' + dataset.tenant + '-' + dataset.subproject,
            path: [Config.DATASETS_KIND],
            enforcedKey: dataset.path.slice(0, -1) + '/' + dataset.name
        });
        const [entity] = await journalClient.get(datasetEntityKey);
        return entity ? await this.fixOldModel(entity, dataset.tenant, dataset.subproject) : entity;
    }

    private static async getKeys(journalClient: IJournal, datasets: DatasetModel[]): Promise<any> {
        const keys = [];

        for (const dataset of datasets) {
            keys.push(journalClient.createKey({
                namespace: Config.SEISMIC_STORE_NS + '-' + dataset.tenant + '-' + dataset.subproject,
                path: [Config.DATASETS_KIND],
                enforcedKey: dataset.path.slice(0, -1) + '/' + dataset.name,
            }));
        }
        return keys;
    }

    public static async exists(journalClient: IJournal, datasets: DatasetModel[]): Promise<boolean[]> {
        const keys = await this.getKeys(journalClient, datasets);
        const bools = [] as boolean[];
        const results = await journalClient.getIdByKeys(keys);

        for(const key of keys) {
            bools.push(results.includes(key.partitionKey));
        }
        return bools;
    }

    public static async sizes(journalClient: IJournal, datasets: DatasetModel[]): Promise<number[]> {
        const keys = await this.getKeys(journalClient, datasets);
        const sizes = [] as number[];
        const results =  await journalClient.getMetaDataSizesByKeys(keys);

        for (const key of keys) {
            sizes.push(results.has(key.partitionKey) ? results.get(key.partitionKey) : -1);
        }
        return sizes;
    }

    public static async get(
        journalClient: IJournal,
        dataset: DatasetModel): Promise<[DatasetModel, any]> {
        let query = journalClient.createQuery(
            Config.SEISMIC_STORE_NS + '-' + dataset.tenant + '-' + dataset.subproject, Config.DATASETS_KIND);

        query = query.filter('name', dataset.name).filter('path', dataset.path);

        const [entities] = await journalClient.runQuery(query);

        return entities.length === 0 ?
            [undefined, undefined] :
            [await this.fixOldModel(
                entities[0] as DatasetModel,
                dataset.tenant, dataset.subproject), entities[0][journalClient.KEY]];
    }

    public static async update(
        journalClient: IJournal, dataset: DatasetModel, datasetKey: any) {
        dataset.ctag = Utils.makeID(16);
        await journalClient.save({ key: datasetKey, data: dataset });
    }

    public static async updateAll(
        journalClient: IJournal, datasets: { data: DatasetModel, key: any; }[]) {
        datasets.forEach(dataset => { dataset.data.ctag = Utils.makeID(16); });
        await journalClient.save(datasets);
    }

    public static async list(
        journalClient: IJournal,
        dataset: DatasetModel, pagination: PaginationModel, searchParam:string, selectParam:string[]):
        Promise<any> {

        let query: any;
        if (dataset.gtags === undefined || dataset.gtags.length === 0) {
            query = journalClient.createQuery(
                Config.SEISMIC_STORE_NS + '-' + dataset.tenant + '-' + dataset.subproject, Config.DATASETS_KIND);
        } else {
            // filter based on gtags if parsed dataset model has gtags
            query = journalClient.createQuery(
                Config.SEISMIC_STORE_NS + '-' + dataset.tenant + '-' + dataset.subproject, Config.DATASETS_KIND);
            for (const gtag of dataset.gtags) {
                query = query.filter('gtags', journalClient.getQueryFilterSymbolContains(), gtag);
            }
        }

        if (pagination && pagination.cursor) { query = query.start(pagination.cursor); }

        if (pagination && pagination.limit) { query = query.limit(pagination.limit); }

        if (searchParam) {
            const [variable, value] = searchParam.split('=');
            query = query.filter(variable, 'LIKE', value);
        }

        if (selectParam){ query = query.select(selectParam); }

        const [entities, info] = await journalClient.runQuery(query);

        // Fix model for old entity
        if(!selectParam){
            for (let entity of entities) {
                entity = await this.fixOldModel(entity, dataset.tenant, dataset.subproject);
            }
        }

        const output: PaginatedDatasetList = {
            datasets: entities,
            nextPageCursor: null
        };

        if (pagination) {
            output.nextPageCursor = info.endCursor || '';
        }

        return output;

    }

    public static async deleteAll(
        journalClient: IJournal, tenantName: string, subprojectName: string) {

        const query = journalClient.createQuery(
            Config.SEISMIC_STORE_NS + '-' + tenantName + '-' + subprojectName, Config.DATASETS_KIND);

        const [entities] = await journalClient.runQuery(query);

        const datasetsToDelete = [];
        for (const entity of entities) {
            datasetsToDelete.push(journalClient.delete(entity[journalClient.KEY]));
        }

        await Promise.all(datasetsToDelete);
    }

    public static async delete(journalClient: IJournal, dataset: DatasetModel) {
        await journalClient.delete(dataset[journalClient.KEY]);
    }

    public static async paginatedListContent(
        journalClient: IJournal, dataset: DatasetModel,
        workingMode: string, pagination: PaginationModel):
        Promise<{ datasets: string[], nextPageCursor: string; }> {

        const output = { datasets: [], nextPageCursor: null };

        // list directories if no pagination is requested
        if (workingMode !== Config.LS_MODE.DATASETS && !pagination.cursor) {
            const [hierarchicalEntities] = await journalClient.listFolders(dataset);
            if (hierarchicalEntities) {
                output.datasets = hierarchicalEntities.map(
                    (entity) => (entity.path || '').substring(dataset.path.length));
                output.datasets = output.datasets.map(
                    (entity) => entity.substr(0, entity.indexOf('/') + 1)).filter(
                        (elem, index, self) => index === self.indexOf(elem));
            }
        }

        // list datasets
        if (workingMode !== Config.LS_MODE.DIRS) {
            let query = journalClient.createQuery(
                Config.SEISMIC_STORE_NS + '-' + dataset.tenant + '-' + dataset.subproject, Config.DATASETS_KIND)
                .filter('path', dataset.path);
            if (pagination.cursor) {
                query = query.start(pagination.cursor);
            }
            if (pagination.limit) {
                query = query.limit(pagination.limit);
            }
            const [datasetEntities, info] = await journalClient.runQuery(query);
            if (datasetEntities.length !== 0 || info.endCursor) {
                output.datasets = output.datasets.concat(datasetEntities.map((item) => item.name));
                if (pagination) {
                    output.nextPageCursor = info.endCursor;
                }
            }
        }

        return output;
    }

    public static async listDatasets(
        journalClient: IJournal,
        tenant: string, subproject: string, pagination?: PaginationModel):
        Promise<{ datasets: { data: DatasetModel, key: any; }[], nextPageCursor: string; }> {

        const output: any = { datasets: [], nextPageCursor: undefined };

        // Retrieve the content datasets
        let query = journalClient.createQuery(
            Config.SEISMIC_STORE_NS + '-' + tenant + '-' + subproject, Config.DATASETS_KIND);

        if (pagination && pagination.cursor) query = query.start(pagination.cursor);
        if (pagination && pagination.limit) query = query.limit(pagination.limit);

        const [datasetEntities, info] = (
            await journalClient.runQuery(query)) as [DatasetModel[], { endCursor?: string; }];

        if (datasetEntities.length !== 0) {
            output.datasets = datasetEntities.map((entity) => {
                return { data: entity, key: entity[journalClient.KEY] };
            });
            if (pagination) {
                output.nextPageCursor = info.endCursor;
            }
        }

        return output;
    }

    public static async listContent(
        journalClient: IJournal, dataset: DatasetModel,
        workingMode: string = Config.LS_MODE.ALL): Promise<{ datasets: string[], directories: string[]; }> {

        const results = { datasets: [], directories: [] };

        // list datasets
        if (workingMode !== Config.LS_MODE.DIRS) {
            const query = journalClient.createQuery(
                Config.SEISMIC_STORE_NS + '-' + dataset.tenant + '-' + dataset.subproject, Config.DATASETS_KIND)
                .filter('path', dataset.path);
            const [datasetEntities] = await journalClient.runQuery(query);
            if (datasetEntities.length !== 0) { results.datasets = datasetEntities.map((item) => item.name); }
        }

        // list directories
        if (workingMode !== Config.LS_MODE.DATASETS) {
            const [hierarchicalEntities] = await journalClient.listFolders(dataset);
            if (hierarchicalEntities) {
                results.directories = hierarchicalEntities.map(
                    (entity) => (entity.path).substring(dataset.path.length));
                results.directories = results.directories.map(
                    (entity) => entity.substr(0, entity.indexOf('/') + 1)).filter(
                        (elem, index, self) => index === self.indexOf(elem));
            }
        }

        return results;

    }

    // keep the returned metadata aligned with the original model also if internal implementation change
    public static async fixOldModel(
        entity: DatasetModel, tenantName: string, subprojectName: string): Promise<DatasetModel> {

        entity.subproject = entity.subproject || subprojectName;
        entity.tenant = entity.tenant || tenantName;
        entity.ctag = entity.ctag || '0000000000000000';
        entity.readonly = entity.readonly || false;
        const lockKey = entity.tenant + '/' + entity.subproject + entity.path + entity.name;
        const lockres = await Locker.getLock(lockKey);
        if (!lockres) { // unlocked
            entity.sbit = null;
            entity.sbit_count = 0;
        } else if (Locker.isWriteLock(lockres)) { // write lock
            entity.sbit = lockres as string;
            entity.sbit_count = 1;
        } else { // read lock
            entity.sbit = (lockres as string[]).join(',');
            entity.sbit_count = lockres.length;
        }
        return entity;
    }

}
