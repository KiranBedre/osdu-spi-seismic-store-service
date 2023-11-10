// Copyright 2022 Google LLC
// Copyright 2022 EPAM Systems
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

import { TenantModel } from '../../../services/tenant';
import { AbstractJournal, AbstractJournalTransaction, IJournalQueryModel, IJournalTransaction, JournalFactory } from '../../journal';
import { AnthosConfig } from './config';

import { Utils } from '../../../shared/utils'
import { Prisma, PrismaClient } from '@prisma/client'
import { AnthosLogger } from './logger';

const logger = new AnthosLogger();

/*
Prisma Client PostgreSQL Json Filter
*/
interface FilterExpression {
    key?,
    name?,
    data?: {
        path: string[]
    }
}


/*
PostgreSQL Prisma Client query
*/
interface PSQLQuery {
    where?: {
        AND?: FilterExpression[]
    },
    take?: number,
    skip?: number,
    cursor?: {
        id: number
    }
}

/*
Datastore Operators to PSQL operators mapper
*/
const datastorePSQLMapper: object = {
    '=': 'equals',
    '<': 'lt',
    '>': 'gt',
    '<=': 'lte',
    '>=': 'gte',
    'CONTAINS': 'array_contains'
}


class Client {

    private dbClient = undefined;

    public getClient() {
        try {
            if (this.dbClient === undefined) {
                this.dbClient = new PrismaClient();
            }
            return this.dbClient;
        } catch (e) {

            logger.error(e);
            return undefined;
        }
    }
}


const dbClient = new Client();


/*
This looks disgusting, because common code uses syntax of GCP Datastore, so we have to follow its interface here.
*/
@JournalFactory.register('anthos')
export class PostgreSQLDAO extends AbstractJournal {

    private dbClient: PrismaClient;
    public KEY = Symbol('id');

    private constructor(tenantModel: TenantModel) {
        super();
        this.dbClient = dbClient.getClient();
    }

    public async save(datasetEntity: any): Promise<void> {
        if (!(datasetEntity instanceof Array)) {
            datasetEntity = [datasetEntity];
        }
        for (const entity of datasetEntity) {
            const item = {
                name: entity.key.name,
                key: entity.key.partitionKey,
                data: entity.data
            }
            item.data[this.KEY.toString()] = entity.key;
            if (entity.ctag) {
                item.data.ctag = entity.ctag;
            }
            await this.dbClient.seismicData.upsert(
                {
                    where: {
                        key_name: {
                            name: item.name,
                            key: item.key
                        }
                    },
                    update: {
                        data: item.data as Prisma.JsonObject
                    },
                    create: {
                        name: item.name,
                        key: item.key,
                        data: item.data as Prisma.JsonObject
                    }
                }
            )
        }
    }

    public async get(key: any): Promise<[any | any[]]> {
        const item = await this.dbClient.seismicData.findFirst({
            where: {
                name: key.name,
                key: key.partitionKey
            }
        });

        if (item === null) {
            return [undefined];
        };

        const data = item.data;
        return [data];
    }

    public async delete(key: any): Promise<void> {
        await this.dbClient.seismicData.delete(
            {
                where: {
                    key_name: {
                        name: key.name,
                        key: key.partitionKey
                    }
                }
            }
        );
    }

    public createQuery(namespace: string, kind: string): IJournalQueryModel {
        return new PostgreSQLQuery(namespace, kind);
    }

    public async runQuery(query: IJournalQueryModel): Promise<[any[], { endCursor?: string }]> {
        logger.info('Run query');
        const postgreSQLQuery = (query as PostgreSQLQuery);
        const statement = postgreSQLQuery.prepareSqlStatement(AnthosConfig.DATASETS_KIND);

        const response = await this.dbClient.seismicData.findMany(
            statement
        );
        logger.info('Found' + response);
        const results = response.map(result => {
            if (!result.data) {
                return result;
            } else {
                if (result.data[this.KEY.toString()]) {
                    result.data[this.KEY] = result.data[this.KEY.toString()];
                    delete result.data[this.KEY.toString()];
                    return result.data;
                } else {
                    return result.data;
                }
            }
        });

        let endCursor: string;
        if (response.length) {
            endCursor = String(response[response.length - 1].id);
        }

        return Promise.resolve(
            [
                results,
                {
                    endCursor
                }
            ]);
    }

    public createKey(specs: any): object {
        const kind = specs.path[0];
        const partitionKey = specs.namespace + '-' + kind;
        let name: string;
        if (kind === AnthosConfig.DATASETS_KIND) {
            name = Utils.makeID(16);
        } else if (kind === AnthosConfig.SEISMICMETA_KIND) {
            name = specs.path[1].replace(/\W/g, '-');
        } else {
            name = specs.path[1];
        }
        return { name, partitionKey, kind };
    }

    public getTransaction(): IJournalTransaction {
        return new PostgreSQLTransactionDAO(this);
    }

    public getQueryFilterSymbolContains(): string {
        return 'CONTAINS';
    }

}

export interface QueryStatement {
    where: object,
    orderBy: object
}

declare type OperationType = 'save' | 'delete';
export class PostgreSQLTransactionOperation {

    public constructor(type: OperationType, entityOrKey: any) {
        this.type = type;
        this.entityOrKey = entityOrKey;
    }

    public type: OperationType;
    public entityOrKey: any;
}

/**
 * A wrapper class for datastore transactions
 * ! Note: looks awfully close to datastore interface.
 */
export class PostgreSQLTransactionDAO extends AbstractJournalTransaction {

    public KEY = null;

    public constructor(owner: PostgreSQLDAO) {
        super();
        this.owner = owner;
        this.KEY = this.owner.KEY;
    }

    public async save(entity: any): Promise<void> {
        this.queuedOperations.push(new PostgreSQLTransactionOperation('save', entity));
        await Promise.resolve();
    }

    public async get(key: any): Promise<[any | any[]]> {
        return await this.owner.get(key);
    }

    public async delete(key: any): Promise<void> {
        this.queuedOperations.push(new PostgreSQLTransactionOperation('delete', key));
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

    private owner: PostgreSQLDAO;
    public queuedOperations: PostgreSQLTransactionOperation[] = [];
}


declare type Operator = '=' | '<' | '>' | '<=' | '>=' | 'HAS_ANCESTOR' | 'CONTAINS';

class SqlStatementBuilder {

    public tableName: string;
    public alias: string;
    public filterExpressions: PostgreJSONDataSQLFilter[] = undefined;
    public limit: number = undefined;
    public cursor: number = undefined;
    public groupByFieldNames: string[] = [];

    constructor(tableName: string, alias: string) {
        this.tableName = tableName;
        this.alias = alias;
    }

    public build(): PSQLQuery {
        const query = {} as PSQLQuery;
        if (this.filterExpressions) {

            query['where'] = { AND: [] };

            this.filterExpressions.forEach(filterExpression => {
                query['where'].AND.push(filterExpression.filterExpression)
            });
        };

        if (this.limit) {
            query['take'] = this.limit;
        }

        if (this.cursor) {
            query['skip'] = 1;
            query['cursor'] = { id: this.cursor };
        }

        return query;
    }


}

class PostgreJSONDataSQLFilter {

    public constructor(property: string, operator: Operator, value: {}) {
        this.property = property;
        this.operator = operator;
        this.value = value;
        this.filterExpression = this.createFilterExpression();
    }

    public property: string;

    public operator: Operator;

    public value: {};

    public filterExpression: FilterExpression;

    private createFilterExpression(): FilterExpression {
        if (this.operator === 'HAS_ANCESTOR') {
            throw new Error('HAS_ANCESTOR operator is not supported in query filters.');
        }
        const filter = {
            data: {
                path: [this.property],
            }
        }

        const psqlOperator = datastorePSQLMapper[this.operator];
        // Prisma for PostgreSQL requires a value to be an array if the operator is 'array_contains'
        if (this.operator === 'CONTAINS') {
            filter['data'][psqlOperator] = [this.value];
        } else {
            filter['data'][psqlOperator] = this.value;
        }

        return filter as FilterExpression;
    }
}

/**
 * A shim for PostgreSQL that provides compatibility with Google's SDK.
 * ! Note: looks awfully close to Google Query interface.
 */
export class PostgreSQLQuery implements IJournalQueryModel {

    private filters: PostgreJSONDataSQLFilter[] = [];
    private pagingStart?: string;
    private pagingLimit?: number;
    public namespace: string;
    public kind: string;


    public constructor(namespace: string, kind: string) {
        this.namespace = namespace;
        this.kind = kind;
    }

    filter(property: string, value: {}): IJournalQueryModel;

    filter(property: string, operator: Operator, value: {}): IJournalQueryModel;

    filter(property: string, operator?: Operator, value?: {}): IJournalQueryModel {
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

        const filter = new PostgreJSONDataSQLFilter(property, operator, value);

        this.filters.push(filter);

        return this;
    }

    start(start: string | Buffer): IJournalQueryModel {
        if (start instanceof Buffer) {
            throw new Error('Type \'Buffer\' is not supported for CosmosDB Continuation while paging.');
        }
        if (start === undefined) {
            this.pagingStart = undefined;
        }
        else {
            this.pagingStart = start as string;
        }
        return this;
    }

    limit(n: number): IJournalQueryModel {
        this.pagingLimit = n;
        return this;
    }

    groupBy(fieldNames: string | string[]): IJournalQueryModel {
        return this;
    }

    select(fieldNames: string | string[]): IJournalQueryModel {
        return this;
    }

    public prepareSqlStatement(tableName: string): object {

        const builder = new SqlStatementBuilder(tableName, 'a');

        builder.filterExpressions = this.filters;

        if (this.pagingLimit) {
            builder.limit = this.pagingLimit;
        }

        if (this.pagingStart) {
            builder.cursor = Number(this.pagingStart);
        }

        const query = builder.build();
        query.where.AND.push({ key: this.namespace + '-' + this.kind })

        return query;
    }
}
