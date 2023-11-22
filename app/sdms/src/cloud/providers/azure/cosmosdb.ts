// ============================================================================
// Copyright 2017-2023, Schlumberger
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

import crypto from 'crypto';

import { CosmosClient, Container, FeedResponse, ItemResponse, OperationInput, BulkOperationType } from '@azure/cosmos';
import { AbstractJournal, AbstractJournalTransaction, IJournalExtendedQueryModel, IJournalQueryModel,
    IJournalTransaction, JournalFactory } from '../../journal';
import { TenantModel } from '../../../services/tenant';
import { AzureDataEcosystemServices } from './dataecosystem';
import { AzureConfig } from './config';
import { Config } from '../..';
import { CallContext, Error, Utils } from '../../../shared';

import axios, { AxiosInstance } from 'axios';
import { DatasetModel, ListDatasetsParams, QueryFilter, QueryFilterVisitor, AndQueryFilter, MatchQueryFilter,
    NotQueryFilter, OrQueryFilter } from '../../../services/dataset';

@JournalFactory.register('azure')
export class AzureCosmosDbDAO extends AbstractJournal {

    public KEY = Symbol('id');
    private dataPartition: string;
    private static containerCache: { [key: string]: Container; } = {};
    public static axiosInstance: AxiosInstance;

    public async getCosmoContainer(): Promise<Container> {

        const databaseId = 'sdms-db'
        const containerId = 'data';

        if (!AzureCosmosDbDAO.containerCache[this.dataPartition]) {
            const connectionParams = await AzureDataEcosystemServices.getCosmosConnectionParams(this.dataPartition);
            const cosmosClient = new CosmosClient({
                endpoint: connectionParams.endpoint,
                key: connectionParams.key
            });
            const { database } = await cosmosClient.databases.createIfNotExists({ id: databaseId });
            const { container } = await database.containers.createIfNotExists({
                id: containerId,
                maxThroughput: AzureConfig.COSMO_MAX_THROUGHPUT,
                partitionKey: { paths: ['/id'], version: 2 }
            });
            AzureCosmosDbDAO.containerCache[this.dataPartition] = container;
        }

        return AzureCosmosDbDAO.containerCache[this.dataPartition];

    }

    public constructor(tenant: TenantModel) {
        super();
        this.dataPartition = tenant.esd.indexOf('.') !== -1 ? tenant.esd.split('.')[0] : tenant.esd;
        AzureCosmosDbDAO.axiosInstance = axios.create({
            httpsAgent: require('https').Agent({
                rejectUnauthorized: false
            })
        });
    }

    private checkAndParseCosmosError(error: any) {
        if (axios.isAxiosError(error)) {
            if (!error.response.data['detail']) {
                if (error.response.status === 404) { return; }
                throw (Error.makeForHTTPRequest({
                    statusCode: error.response.status, message: error.response.statusText
                }))
            } else {
                const detail = error.response.data['detail'];
                const detailCode = +detail.substring(0, detail.indexOf('-'));
                if (detailCode === 404) { return; }
                let detailError = detail;
                try {
                    detailError = detail.substring(detail.indexOf('[') + 1);
                    detailError = detailError.substring(0, detailError.indexOf(']'));
                    detailError = detailError.replace(/(\r\n|\n|\r)/gm, '').trim();
                    if (detailError.startsWith('\"')) { detailError = detailError.substring(1); }
                    if (detailError.endsWith('\"')) { detailError = detailError.substring(0, detailError.length - 2); }
                } catch (error) { detailError = detail }
                throw (Error.makeForHTTPRequest({
                    name: 'StatusCodeError', statusCode: detailCode, message: detailError
                }))
            }
        } else {
            throw error;
        }
    }

    public async save(datasetEntity: any): Promise<void> {

        if (!(datasetEntity instanceof Array)) {
            datasetEntity = [datasetEntity];
        }

        for (const entity of datasetEntity) {
            const item = {
                id: entity.key.partitionKey,
                data: entity.data
            }
            item.data[this.KEY.toString()] = entity.key;
            await (await this.getCosmoContainer()).items.upsert(item);
        }
    }

    public async get(key: any): Promise<[any | any[]]> {
        let retry = 0;
        let item: ItemResponse<any>;
        while (retry++ < 5) {
            item = await (await this.getCosmoContainer()).item(key.partitionKey, key.partitionKey).read();
            if (item.statusCode !== 404 || !Config.ENABLE_STRONG_CONSISTENCY_EMULATION) { break; }
            await new Promise((resolve) => setTimeout(resolve, 200));
        }

        if (!item.resource) {
            if (item.statusCode === 404) {
                return [undefined];
            } else {
                throw (Error.make(item.statusCode, 'Internal Cosmos Server Error'));
            }
        }

        const data = item.resource.data;
        data[this.KEY] = data[this.KEY.toString()];
        delete data[this.KEY.toString()];
        return [data];
    }

    private async getMetaDataByKeys(keys: any[]): Promise<any[]> {
        let query = 'SELECT * FROM c WHERE c.id = ';
        for (let i = 0; i < keys.length; i++) {
            if (i === 0) {
                query += '\"' + keys[i].partitionKey + '\"';
            }
            else {
                query += ' OR c.id = \"' + keys[i].partitionKey + '\"';
            }
        }
        return (await (await this.getCosmoContainer()).items.query(query).fetchAll()).resources;
    }

    public async getIdByKeys(keys: any[]): Promise<string[]> {
        const ids = [] as string[];
        const results = await this.getMetaDataByKeys(keys)

        for(const res of results) {
            ids.push(res['id']);
        }
        return ids;
    }

    public async getMetaDataSizesByKeys(keys: any[]): Promise<Map<string, number>> {
        const sizes = new Map<string, number>();
        const results = await this.getMetaDataByKeys(keys)

        for (const result of results) {
            if (result['id'] && result['data']?.filemetadata) {
                sizes.set(result['id'], result['data']?.filemetadata.size);
            }
        }
        return sizes;
    }

    public async deleteMulti(keys: string[]): Promise<void> {

        if (!keys) { return; }

        const container = await this.getCosmoContainer();
        const operations: OperationInput[] = [];
        for (let ii=0; ii<keys.length; ii++) {
            operations.push({
                operationType: BulkOperationType.Delete,
                id: keys[ii],
                partitionKey: keys[ii],
            });
            if ((ii+1)%100 === 0) {
                await container.items.bulk(operations);
                operations.length = 0;
            }
        }

        if(operations.length) {
            await container.items.bulk(operations);
        }

    }

    public async getSize(dataset: DatasetModel): Promise<{dataset_count: number, size_bytes: number}> {
        let query = 'SELECT count(1) as count, SUM(c.data.computed_size) as size_bytes FROM c'
            + ' WHERE c.data.subproject = @subproject';

        const parameters = [
            {name: '@subproject', value: dataset.subproject},
          ]

        if (dataset.name) {
            if (!dataset.path)
                throw (Error.make(Error.Status.BAD_REQUEST, 'Path needs to be provided.'))
            query += ' AND c.data.name = @name';
            parameters.push({name: '@name', value: dataset.name});
        }

        if (dataset.path) {
            query += ' AND STARTSWITH(c.data.path, @path, false)';
            parameters.push({name: '@path', value: dataset.path});

        }

        const results = (await (await this.getCosmoContainer()).items.query({query, parameters}).fetchAll()).resources;

        if (results.length !== 1)
            throw (Error.make(Error.Status.UNKNOWN, 'Expected 1 but got ' + results.length
                + ' results for dataset sizes query.'))

        return Promise.resolve({
            size_bytes: results[0].size_bytes,
            dataset_count: results[0].count
        })
    }

    public async pathExists(subproject: string, path: string) : Promise<boolean> {
        const query = 'select top 1 * from c where c.data.subproject = @subproject and c.data.path = @path';
        const parameters = [
            {name: '@subproject', value: subproject},
            {name: '@path', value: path}
        ]
        const results = (await (await this.getCosmoContainer()).items.query({query, parameters}).fetchAll()).resources;
        return (results?.length > 0);
    }

    public async delete(key: any): Promise<void> {
        await (await this.getCosmoContainer()).item(key.partitionKey, key.partitionKey).delete();
    }

    public createQuery(namespace: string, kind: string): IJournalQueryModel {
        return new AzureCosmosDbQuery(namespace, kind);
    }

    public async listFolders(dataset: DatasetModel): Promise<any[]> {
        if (AzureConfig.ENABLE_OPTIMIZED_QUERY) {
            return this.getSubfoldersUsingDistinctPathsQuery(
                this.distinctPathsQuery(dataset.tenant, dataset.subproject, dataset.path), dataset);
        }
        return this.getSubfolders(this.subfoldersQuery(dataset.tenant, dataset.subproject, dataset.path), dataset);
    }

    private async getSubfolders(sqlQuery: string, dataset: DatasetModel) {
        if (AzureConfig.SIDECAR_ENABLE_QUERY) {
            const cParams = await AzureDataEcosystemServices.getCosmosConnectionParams(this.dataPartition);
            const url = AzureConfig.SIDECAR_URL + '/query'
            const payload = {
                'cs': 'AccountEndpoint=' + cParams.endpoint + ';' + 'AccountKey=' + cParams.key + ';',
                'sql': sqlQuery,
                'corrid': CallContext.correlationId
            };
            try {
                const result = await AzureCosmosDbDAO.axiosInstance.post(url, payload);
                if (!result.data.records) { return; }
                const records = result.data.records;
                const resultsList: {path: string}[] = []
                for (const record of records) {
                    resultsList.push({
                        path: (dataset.path + record.path).replace('//', '/')
                    });
                }
                return Promise.resolve([resultsList]);
            } catch (error) {
                this.checkAndParseCosmosError(error);
            }
        } else {
            const response = await (await this.getCosmoContainer()).items.query(sqlQuery).fetchAll();
            const results = response.resources.map(result => {
                if (!result.data) {
                    return result;
                }
                if (result.data[this.KEY.toString()]) {
                    result.data[this.KEY] = result.data[this.KEY.toString()];
                    delete result.data[this.KEY.toString()];
                }
                return result.data;
            });
            return Promise.resolve([results]);
        }
    }

    override customizeDatasetsQuery(query: IJournalQueryModel, params: ListDatasetsParams) : IJournalQueryModel {
        return query.filter('subproject', params.dataset.subproject);
    }

    private async getSubfoldersUsingDistinctPathsQuery(sqlQuery: string, dataset: DatasetModel) {
        if (AzureConfig.SIDECAR_ENABLE_QUERY) {
            const cParams = await AzureDataEcosystemServices.getCosmosConnectionParams(this.dataPartition);
            const url = AzureConfig.SIDECAR_URL + '/query'
            const payload = {
                'cs': 'AccountEndpoint=' + cParams.endpoint + ';' + 'AccountKey=' + cParams.key + ';',
                'sql': sqlQuery,
                'corrid': CallContext.correlationId
            };
            try {
                const result = await AzureCosmosDbDAO.axiosInstance.post(url, payload);
                if (!result.data.records) { return; }
                const records = result.data.records;
                const recordPaths = [];
                for (const record of records) {
                    if (record === dataset.path) continue;
                    // finds the path of the subfolder that is nested in dataset.path.
                    // e.g. if dataset.path is "/dev/" and record.path is "/dev/folder/foo/bar/",
                    // the result will be "/dev/folder/"
                    const subfolderWithParentPath = record.substring(0, record.indexOf('/', dataset.path.length) + 1);
                    recordPaths.push(subfolderWithParentPath.replace('//', '/'));
                }
                const distinctPaths = [...new Set(recordPaths)].map(p => ({
                    path: p
                }));
                return Promise.resolve([distinctPaths]);
            } catch (error) {
                this.checkAndParseCosmosError(error);
            }
        } else {
            const response = await (await this.getCosmoContainer()).items.query(sqlQuery).fetchAll();
            const results = response.resources.flatMap(dataPath => {
                // finds the path of the subfolder that is nested in dataset.path.
                // e.g. if record.path is "/dev/" and dataset.path is "/dev/folder/foo/bar/",
                // the result will be "/dev/folder/"
                if (dataPath !== dataset.path)
                    return dataPath.substring(0, dataPath.indexOf('/', dataset.path.length) + 1);
            });
            const uniquePaths = [...new Set(results)].map(p => ({
                path: p
            }));
            return Promise.resolve([uniquePaths]);
        }
    }

    private subfoldersQuery(tenant: string, subproject: string, path: string): string {
        let sqlQuery = 'SELECT SUBSTRING(c.data.path, LENGTH("' + path + '") - 1,';
        sqlQuery += ' INDEX_OF(c.data.path, "/", LENGTH("' + path + '")) -';
        sqlQuery += ' LENGTH("' + path + '") + 2) as path';
        sqlQuery += ' FROM c';
        // dataset exactly belongs to subproject provided
        sqlQuery += ' WHERE RegexMatch(c.id, "^(ds-' + tenant + '-' + subproject + '-)([a-z0-9]+)$")';
        // dataset that is inside of SDPATH provided
        // subfolder of SDPATH provided
        sqlQuery += ' AND STARTSWITH(c.data.path, "' + path + '") AND c.data.path != "' + path + '"';
        // group by the same way we extract the SDPATH
        sqlQuery += ' GROUP BY SUBSTRING(c.data.path, LENGTH("' + path + '") - 1,'
        sqlQuery += ' INDEX_OF(c.data.path, "/", LENGTH("' + path + '")) - LENGTH("' + path + '") + 2)'
        return sqlQuery;
    }

    private distinctPathsQuery(tenant: string, subproject: string, path: string): string {
        // select distinct paths filtering by tenant, subproject and path
        return  'SELECT DISTINCT VALUE c.data.path' +
            ' FROM c WHERE c.data.subproject = "' + subproject +
            '" AND STARTSWITH(c.data.path, "' + path + '", false)';
    }

    public datasetsQueryString(query: IJournalQueryModel): string {
        const cosmosQuery = (query as AzureCosmosDbQuery);
        let sqlQuery: string;

        // return selected fields
        if (cosmosQuery.projectedFieldNames.length) {
            let fieldList = '';
            for (const field of cosmosQuery.projectedFieldNames) {
                if (fieldList) {
                    fieldList += ', ';
                }
                fieldList += ((field === 'id') ? 'c.' : 'c.data.') + field;
            }
            sqlQuery = 'SELECT ' + fieldList
        } else {
            sqlQuery = 'SELECT *';
        }

        sqlQuery += ' FROM c';

        // add filters
        if (cosmosQuery.queryFilter) {
            sqlQuery += ' WHERE ' + QueryFilterEvaluator.convert(cosmosQuery.queryFilter)
        }

        // group results by field
        if (cosmosQuery.groupByFieldNames.length) {
            let groupByList = '';
            for (const field of cosmosQuery.groupByFieldNames) {
                if (groupByList) {
                    groupByList += ', ';
                }
                groupByList += 'c.data.' + field;
            }
            sqlQuery += ' GROUP BY ' + groupByList;
        }

        return sqlQuery;
    }

    public async runQuery(query: IJournalQueryModel): Promise<[any[], { endCursor?: string }]> {
        const cosmosQuery = (query as AzureCosmosDbQuery);

        let sqlQuery: string;
        let response: FeedResponse<any>;

        if (cosmosQuery.kind === Config.SUBPROJECTS_KIND) {
            sqlQuery = 'SELECT * FROM c WHERE c.id LIKE "sp-%"';
            response = await (await this.getCosmoContainer()).items.query(sqlQuery).fetchAll();
        }

        if (cosmosQuery.kind === Config.DATASETS_KIND) {
            sqlQuery = this.datasetsQueryString(query);

            if (AzureConfig.SIDECAR_ENABLE_QUERY) {
                const connectionParams = await AzureDataEcosystemServices.getCosmosConnectionParams(this.dataPartition);
                const url = AzureConfig.SIDECAR_URL + '/query';
                const payload = {};
                payload['cs'] = 'AccountEndpoint=' + connectionParams.endpoint + ';' +
                    'AccountKey=' + connectionParams.key + ';'
                payload['sql'] = sqlQuery;
                payload['corrid'] = CallContext.correlationId;
                if (cosmosQuery.pagingStart) {
                    cosmosQuery.pagingStart = cosmosQuery.pagingStart.replace(/\\/g, '');
                    if (cosmosQuery.pagingStart.startsWith('\"[')) {
                        cosmosQuery.pagingStart = cosmosQuery.pagingStart.replace('\"[', '[');
                    }
                    if (cosmosQuery.pagingStart.endsWith(']\"')) {
                        cosmosQuery.pagingStart = cosmosQuery.pagingStart.replace(']\"', ']');
                    }
                    payload['ctoken'] = cosmosQuery.pagingStart
                }
                if (cosmosQuery.pagingLimit) {
                    payload['limit'] = cosmosQuery.pagingLimit
                }
                try {
                    const result = await AzureCosmosDbDAO.axiosInstance.post(url, payload);

                    if (!result.data.records) { return; }
                    const records = result.data.records;
                    const resultsList = [];
                    if (sqlQuery.indexOf('SELECT *') > -1) {
                        for (const record of records) {
                            const data = record.data;
                            Object.keys(data).forEach(key => {
                                if (data[key] === null || data[key] === undefined) {
                                    delete data[key];
                                }
                            });
                            data[this.KEY] = data['symbolId'];
                            delete data['symbolId'];
                            delete data[this.KEY.toString()];
                            resultsList.push(data);
                        }
                    } else {
                        for (const record of records) {
                            if (Object.keys(record).length !== 0){
                                resultsList.push(record);
                            }
                        }
                    }
                    return Promise.resolve([resultsList, { endCursor: result.data.continuationToken }]);
                } catch (error) {
                    this.checkAndParseCosmosError(error);
                }
            } else {
                if (cosmosQuery.pagingStart || cosmosQuery.pagingLimit) {
                    response = await (await this.getCosmoContainer()).items.query(sqlQuery, {
                        continuationToken: cosmosQuery.pagingStart,
                        maxItemCount: cosmosQuery.pagingLimit
                    }).fetchNext();
                } else {
                    response = await (await this.getCosmoContainer()).items.query(sqlQuery).fetchAll();
                }
            }
        }

        if (cosmosQuery.kind === Config.APPS_KIND) {
            sqlQuery = 'SELECT * FROM c WHERE c.id LIKE "ap-%"';
            response = await (await this.getCosmoContainer()).items.query(sqlQuery).fetchAll();
        }

        const results = response.resources.map(result => {
            if (!result.data) {
                return result;
            }
            if (result.data[this.KEY.toString()]) {
                result.data[this.KEY] = result.data[this.KEY.toString()];
                delete result.data[this.KEY.toString()];
            }
            return result.data;
        });

        return Promise.resolve([results, { endCursor: response.continuationToken }]);
    }

    public createKey(specs: any): object {

        const kind = specs.path[0];
        let partitionKey: string;
        let name: string;

        if (kind === AzureConfig.TENANTS_KIND) {
            name = specs.path[1];
            partitionKey = 'tn-' + name;
        }

        if (kind === AzureConfig.SUBPROJECTS_KIND) {
            name = specs.path[1];
            partitionKey = 'sp-' + name;
        }

        if (kind === AzureConfig.DATASETS_KIND) {
            name = specs.enforcedKey.indexOf('/') === -1 ?
                specs.enforcedKey :
                specs.enforcedKey.substring((specs.enforcedKey).lastIndexOf('/') + 1);
            partitionKey = 'ds' + specs.namespace.replace(new RegExp(Config.SEISMIC_STORE_NS, 'g'), '')
                + '-' + crypto.createHash('sha512').update(specs.enforcedKey).digest('hex');
        }

        if (kind === AzureConfig.APPS_KIND) {
            name = specs.path[1];
            partitionKey = 'ap-' + name;
        }

        return { partitionKey, name };
    }

    public getTransaction(): IJournalTransaction {
        return new AzureCosmosDbTransactionDAO(this);
    }

    public getQueryFilterSymbolContains(): string {
        return 'CONTAINS';
    }
}

declare type Operator = '=' | '<' | '>' | '<=' | '>=' | 'HAS_ANCESTOR' | 'CONTAINS' | 'RegexMatch' | 'LIKE' | 'STARTSWITH';
declare type Type = 'STRING' | 'BOOLEAN' | 'NUMBER';

export class AzureCosmosDbQuery implements IJournalExtendedQueryModel {

    public constructor(namespace: string, kind: string) {
        this.namespace = namespace;
        this.kind = kind;
    }

    filter(property: string, operator?: Operator, value?: {}, type?: Type): IJournalQueryModel {

        if (value === undefined) {
            value = operator;
            operator = '=';
        }

        if (operator === undefined) {
            operator = '=';
        }

        if (value === undefined) {
            value = '';
        }

        if (type === undefined) {
            if (typeof value === 'number') {
                type = 'NUMBER';
            }
            else if (operator === 'LIKE'
                && typeof value === 'string'
                && Utils.isBoolean(value)) {
                type = 'BOOLEAN';
            }
            else {
                type = 'STRING';
            }
        }

        return this.filterBy(new MatchQueryFilter(property, operator, value, type));
    }

    filterBy(queryFilter: QueryFilter): this {
        this.queryFilter = this.queryFilter ? new AndQueryFilter(this.queryFilter, queryFilter) : queryFilter;

        return this;
    }

    start(start: string | Buffer): IJournalQueryModel {
        if (start instanceof Buffer) {
            throw (Error.make(Error.Status.UNKNOWN, 'Type \'Buffer\' is not supported for CosmosDB Continuation while paging.'));
        }
        this.pagingStart = start as string;
        return this;
    }

    limit(n: number): IJournalQueryModel {
        this.pagingLimit = n;
        return this;
    }

    groupBy(fieldNames: string | string[]): IJournalQueryModel {
        if (typeof fieldNames === 'string') {
            this.groupByFieldNames = [fieldNames];
        } else {
            this.groupByFieldNames = fieldNames;
        }
        return this;
    }

    select(fieldNames: string | string[]): IJournalQueryModel {
        if (typeof fieldNames === 'string') {
            this.projectedFieldNames = [fieldNames];
        } else {
            this.projectedFieldNames = fieldNames;
        }
        return this;
    }

    public queryFilter?: QueryFilter;
    public projectedFieldNames: string[] = [];
    public groupByFieldNames: string[] = [];
    public pagingStart?: string;
    public pagingLimit?: number;
    public namespace: string;
    public kind: string;

}

// ===========================================================================
// TRANSACTIONS MODEL
// ===========================================================================

declare type OperationType = 'save' | 'delete';

export class AzureCosmosDbTransactionOperation {

    public constructor(type: OperationType, entityOrKey: any) {
        this.type = type;
        this.entityOrKey = entityOrKey;
    }

    public type: OperationType;
    public entityOrKey: any;
}

export class AzureCosmosDbTransactionDAO extends AbstractJournalTransaction {

    public KEY = null;

    public constructor(owner: AzureCosmosDbDAO) {
        super();
        this.owner = owner;
        this.KEY = this.owner.KEY;
    }

    public async save(entity: any): Promise<void> {
        this.queuedOperations.push(new AzureCosmosDbTransactionOperation('save', entity));
        await Promise.resolve();
    }

    public async get(key: any): Promise<[any | any[]]> {
        return await this.owner.get(key);
    }

    public async delete(key: any): Promise<void> {
        this.queuedOperations.push(new AzureCosmosDbTransactionOperation('delete', key));
        await Promise.resolve();
    }

    public createQuery(namespace: string, kind: string): IJournalQueryModel {
        return this.owner.createQuery(namespace, kind);
    }

    public async runQuery(query: IJournalQueryModel): Promise<[any[], { endCursor?: string }]> {
        return await this.owner.runQuery(query);
    }

    public async run(): Promise<void> {
        if (this.queuedOperations.length) {
            await Promise.reject('Transaction is already in use.');
        }
        else {
            this.queuedOperations = [];
            return Promise.resolve();
        }
    }

    public async rollback(): Promise<void> {
        this.queuedOperations = [];
        return Promise.resolve();
    }

    public async commit(): Promise<void> {

        for (const operation of this.queuedOperations) {
            if (operation.type === 'save') {
                await this.owner.save(operation.entityOrKey);
            }
            if (operation.type === 'delete') {
                await this.owner.delete(operation.entityOrKey);
            }
        }

        this.queuedOperations = [];
        return Promise.resolve();
    }

    public getQueryFilterSymbolContains(): string {
        return 'CONTAINS';
    }

    private owner: AzureCosmosDbDAO;
    public queuedOperations: AzureCosmosDbTransactionOperation[] = [];
}

class QueryFilterEvaluator extends QueryFilterVisitor {
    result: string;

    visitAnd(element: AndQueryFilter): void {
        this.result = QueryFilterEvaluator.convertAnd(element);
    }

    visitMatch(element: MatchQueryFilter): void {
        this.result = QueryFilterEvaluator.convertMatch(element);
    }

    visitNot(element: NotQueryFilter): void {
        this.result = QueryFilterEvaluator.convertNot(element);
    }

    visitOr(element: OrQueryFilter): void {
        this.result = QueryFilterEvaluator.convertOr(element);
    }

    static convert(element: QueryFilter): string {
        const visitor = new QueryFilterEvaluator()
        element.accept(visitor);
        return visitor.result;
    }

    private static convertAnd(element: AndQueryFilter): string {
        return element.filters.map(queryFilter => {
            return '('
            + QueryFilterEvaluator.convert(queryFilter)
            + ')'
        }).join(' AND ');
    }

    private static convertOr(element: OrQueryFilter): string {
        return element.filters.map(queryFilter => {
            return '('
            + QueryFilterEvaluator.convert(queryFilter)
            + ')'
        }).join(' OR ');
    }

    private static convertMatch(element: MatchQueryFilter): string {
        if (element.operator === 'CONTAINS') {
            // Using EXISTS (SELECT ... ) is preferable to ARRAY_CONTAINS, as it supports putting NOT in front of the
            // query, which allows a simple implementation for the `not` operator.
            // Using IS_STRING is necessary to support the `not` operator, otherwise datasets that are not strings
            // are not returned when using the `not` operator.
            return '(EXISTS (SELECT VALUE 1 FROM t IN c.data.' + element.property + ' WHERE t = ' + '\'' +
                element.value + '\'' + ') OR (IS_STRING(c.data.' + element.property + ') AND STRINGEQUALS(c.data.' +
                element.property + ', ' + '\'' + element.value + '\'' + ')))';
        } else if (element.operator === 'RegexMatch') {
            return '(RegexMatch(c.data.' + element.property + ', \'' + element.value + '\')' + ')';
        } else if (element.operator === 'STARTSWITH') {
            return '(STARTSWITH(c.data.' + element.property + ', \'' + element.value + '\', false)' + ')';
        } else {
            if (element.type === 'STRING') {
                return 'c.data.' + element.property + ' ' + element.operator + ' "' + element.value + '"';
            }
            else {
                return 'c.data.' + element.property + ' ' + element.operator + ' ' + element.value;
            }
        }
    }

    private static convertNot(element: NotQueryFilter): string {
        return 'NOT ('
                + QueryFilterEvaluator.convert(element.filter) + ')';
    };
}
