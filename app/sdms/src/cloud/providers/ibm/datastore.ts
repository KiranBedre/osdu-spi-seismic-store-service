/* Licensed Materials - Property of IBM              */
/* (c) Copyright IBM Corp. 2020. All Rights Reserved.*/

import {
    AbstractJournal,
    AbstractJournalTransaction,
    IJournalQueryModel,
    IJournalTransaction,
    JournalFactory } from '../../journal';
import { TenantModel } from '../../../services/tenant';
import { Config } from '../../config';
import { Utils } from '../../../shared/utils'
import { IbmConfig } from './config';
import { logger } from './logger';
import { CloudantV1 } from '@ibm-cloud/cloudant';

// [TODO] all logger.info looks more DEBUG message should not be executed in production code
// [TODO] don't use any! use types
@JournalFactory.register('ibm')
export class DatastoreDAO extends AbstractJournal {
    public KEY = Symbol('id');
    private dataPartition: string;
    private docDb: CloudantV1;
    private docParams: CloudantV1.GetDocumentParams;

    public constructor(tenant: TenantModel) {
        super();
        logger.info('In datastore.constructor.');
        this.dataPartition = tenant.gcpid;
    }

    public async initDb(dataPartition: string) {
        logger.info('In datastore.initDb. ');
        const dbUrl = IbmConfig.DOC_DB_URL;
        const cloudantOb = CloudantV1.newInstance({ serviceUrl: dbUrl });
        logger.info('DB initialized. cloudantOb-');

        try {
            logger.debug('Before DB connection');
            await cloudantOb.getDatabaseInformation({ db: IbmConfig.DOC_DB_COLLECTION + '-' + dataPartition });
            logger.debug('Got DB connection');
        } catch (err) {
            if(err.statusCode === 404)
            {
                logger.debug('Database does not exist. Creating database.');
                await cloudantOb.putDatabase({ db: IbmConfig.DOC_DB_COLLECTION + '-' + dataPartition } )
                logger.debug('Database created.');
            }
            else
            {
                logger.debug('DB connection error - ', err);
                return;
            }
        }

        this.docDb = cloudantOb;
        this.docParams = {
            db: IbmConfig.DOC_DB_COLLECTION + '-' + dataPartition,
            docId: '',
        };

    }

    public async get(key: any): Promise<[any | any[]]> {
        logger.info('In datastore get.');
        logger.debug(key);
        let entityDocument: any;
        await this.initDb(this.dataPartition);
        // using the field 'name' to fetch the document. Note: the get() is expecting the field _id
        this.docParams.docId = key.name;
        entityDocument = await this.docDb.getDocument(this.docParams).then(
            (result: any) => {
                result.result[this.KEY] = result.result[this.KEY.toString()];
                delete result.result[this.KEY.toString()];
                logger.info('Deleted field');
                logger.debug(result.result[this.KEY.toString()]);
                return [result.result];
            }
        ).catch((error: any) => {
            logger.error('Get failed to fetch the document.');
            logger.error(error);
            return [undefined];
        })
        logger.debug(entityDocument);
        logger.info('returning from datastore');
        return entityDocument;
    }

    public async save(entity: any): Promise<void> {
        logger.info('In datastore.save.');
        logger.debug(entity);
        const self = this;
        logger.info('Connecting to DB.');
        await this.initDb(this.dataPartition);
        logger.info('Fetching document.');

        try{
            this.docParams.docId = entity.key.name;
            this.docParams.revsInfo = true;
            let existingDoc: CloudantV1.Document;
            await this.docDb.getDocument(this.docParams)
            .then((docResult) => {
                existingDoc = docResult.result;
            });
            logger.info('Document exists in db.');
            const docTemp = JSON.parse(JSON.stringify(existingDoc));
            // have to add if condition. before that check the dataset object structure
            docTemp.ltag = entity.ltag;
            if (entity.data.trusted)
                docTemp.trusted = entity.data.trusted;
            Object.assign(docTemp, entity.data);
            logger.debug(docTemp);
            const postDocumentParams: CloudantV1.PostDocumentParams = {
                db: this.docParams.db,
                document: docTemp
            };
            await this.docDb.postDocument(postDocumentParams);
            logger.info('Document updated.');
        } catch(err){
            if(err.statusCode === 404)
            {
                logger.info('Document does not exist. This will be a new document');
                const customizedOb = {};
                customizedOb['id'] = entity.key.name;
                customizedOb['key'] = entity.key.partitionKey;
                customizedOb[self.KEY.toString()] = entity.key;
                for (const element in entity.data) {
                    if (!((entity.key.kind === 'datasets' || entity.key.kind === 'seismicmeta') && element === '_id'))
                        if (!((entity.key.kind === 'datasets' || entity.key.kind === 'seismicmeta') && element === '_rev'))
                                    customizedOb[element] = entity.data[element];
                };
                logger.debug(customizedOb);
                const postDocumentParams: CloudantV1.PutDocumentParams = {
                    db: this.docParams.db,
                    docId: this.docParams.docId,
                    document: customizedOb
                };
                await this.docDb.putDocument(postDocumentParams);
                logger.info('Document inserted.');
            }
        }
        logger.info('Returning from datastore.save.');

    }

    public async delete(key: any): Promise<void> {
        logger.info('In datastore.delete.');
        logger.info('Connecting to DB.');
        await this.initDb(this.dataPartition);

        this.docParams.docId = key.name;
        this.docParams.revsInfo = true;
        await this.docDb.getDocument(this.docParams)
        .then(async(docResult) =>  {
            const document: CloudantV1.Document = docResult.result;
            await this.docDb.deleteDocument({
                db: this.docParams.db,
                docId: document._id,
                rev: document._rev
            }).then(() => {
                logger.info('Document deleted.');
            });
        }).catch ((err) => {
            logger.error('Deletion failed. Error - ');
            logger.error(err);
        });
        logger.info('Returning from datastore.delete.');
    }

    public createQuery(namespace: string, kind: string): IJournalQueryModel {
        logger.info('In datastore.createQuery. Returning.');
        logger.debug(namespace);
        logger.debug(kind);
        return new IbmDocDbQuery(namespace, kind);
    }

    public async runQuery(query: IJournalQueryModel): Promise<[any[], { endCursor?: string }]> {
        logger.info('In datastore.runQuery.');
        const queryObject = (query as IbmDocDbQuery);
        logger.debug(queryObject);
        // tableName datasets??
        const mangoQuery = queryObject.prepareStatement(Config.DATASETS_KIND, queryObject.namespace, queryObject.kind);
        logger.debug(mangoQuery);
        let docs;
        logger.info('Connecting to DB.');
        await this.initDb(this.dataPartition);
        await this.docDb.postSearch(mangoQuery).then((doc) => {
            docs = doc.result?.rows;
            logger.debug(docs);
        });
        logger.info('Find query executed.');
        const results = docs.map(result => {
            if (!result) {
                return result;
            } else {
                if (result?.doc[this.KEY.toString()]) {
                    result.doc[this.KEY] = result.doc[this.KEY.toString()];
                    delete result.doc[this.KEY.toString()];
                    return result;
                } else {
                    return result;
                }
            }
        });
        return Promise.resolve([results, {}]);
    }

    public createKey(specs: any): object {
        logger.info('In datastore.createKey');
        logger.debug(specs);
        const kind = specs.path[0];
        const partitionKey = specs.namespace + '-' + kind;
        let name: string;
        if (kind === Config.DATASETS_KIND) {
            name = Utils.makeID(16);
        } else if (kind === Config.SEISMICMETA_KIND) {
            name = specs.path[1].replace(/\W/g, '-');// replaces path slashes into hyphen
        } else {
            name = specs.path[1];
        }
        logger.debug(name);
        logger.debug(partitionKey);
        logger.debug(kind);
        logger.info('returning from createKey');
        return { name, partitionKey, kind };
    }

    public getTransaction(): IJournalTransaction {
        logger.info('In datastore.getTransaction');
        return new IbmDocDbTransactionDAO(this);
    }

    public getQueryFilterSymbolContains(): string {
        logger.info('In datastore.getQueryFilterSymbolContains. Not implemented');
        return 'CONTAINS';// not implemented
    }
}

declare type OperationType = 'save' | 'delete';
export class IbmDocDbTransactionOperation {

    public constructor(type: OperationType, entityOrKey: any) {
        logger.info('In datastore.IbmDocDbTransactionOperation.constructor.');
        logger.debug(type);
        logger.debug(entityOrKey);
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
export class IbmDocDbTransactionDAO extends AbstractJournalTransaction {

    public KEY = null;

    public constructor(owner: DatastoreDAO) {
        super();
        logger.info('In datastore.IbmDocDbTransactionDAO.constructor.');
        logger.debug(owner);
        this.owner = owner;
        this.KEY = this.owner.KEY;
    }

    public async save(entity: any): Promise<void> {
        logger.info('In datastore.IbmDocDbTransactionDAO.save.');
        logger.debug(entity);
        this.queuedOperations.push(new IbmDocDbTransactionOperation('save', entity));
        await Promise.resolve();
    }

    public async get(key: any): Promise<[any | any[]]> {
        logger.info('In datastore.IbmDocDbTransactionDAO.get.');
        logger.debug(key);
        return await this.owner.get(key);
    }

    public async delete(key: any): Promise<void> {
        logger.info('In datastore.IbmDocDbTransactionDAO.delete.');
        logger.debug(key);
        this.queuedOperations.push(new IbmDocDbTransactionOperation('delete', key));
        await Promise.resolve();
    }

    public createQuery(namespace: string, kind: string): IJournalQueryModel {
        logger.info('In datastore.IbmDocDbTransactionDAO.createQuery.');
        logger.debug(namespace);
        logger.debug(kind);
        return this.owner.createQuery(namespace, kind);
    }

    public async runQuery(query: IJournalQueryModel): Promise<[any[], { endCursor?: string }]> {
        logger.info('In datastore.IbmDocDbTransactionDAO.runQuery.');
        logger.debug(query)
        return await this.owner.runQuery(query);
    }

    public async run(): Promise<void> {
        logger.info('In datastore.IbmDocDbTransactionDAO.run.');
        if (this.queuedOperations.length) {
            await Promise.reject('Transaction is already in use.');
        }
        else {
            this.queuedOperations = [];
            return Promise.resolve();
        }
    }

    public async rollback(): Promise<void> {
        logger.info('In datastore.IbmDocDbTransactionDAO.rollback.');
        this.queuedOperations = [];
        return Promise.resolve();
    }

    public async commit(): Promise<void> {
        logger.info('In datastore.IbmDocDbTransactionDAO.commit.');
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
        logger.info('In datastore.IbmDocDbTransactionDAO.getQueryFilterSymbolContains. Not implemented');
        return '';
    }

    private owner: DatastoreDAO;
    public queuedOperations: IbmDocDbTransactionOperation[] = [];
}


/**
 * not sure of HAS_ANCESTOR and CONTAINS in CouchDB.
 */
declare type Operator = '=' | '<' | '>' | '<=' | '>=' | 'HAS_ANCESTOR' | 'CONTAINS';

/*
declaring enum for operator
*/
enum CouchOperators {
    Equal = '$eq',
    GreaterThan = '$gt',
    LesserThan = '$lt',
    GreaterThanEqualTo = '$gte',
    LesserThanEqualTo = '$lte',
    Contains = '$elemMatch',
}

enum ConditionalOperators {
    Equal = '=',
    GreaterThan = '>',
    LesserThan = '<',
    GreaterThanEqualTo = '>=',
    LesserThanEqualTo = '<=',
    Contains = 'CONTAINS',
}

/**
 * implementation of IJournalQueryModel
 */
export class IbmDocDbQuery implements IJournalQueryModel {

    public namespace: string;
    public kind: string;

    public constructor(namespace: string, kind: string) {
        logger.info('In datastore.IbmDocDbQuery.constructor.');
        logger.debug(namespace);
        logger.debug(kind);
        this.namespace = namespace;
        this.kind = kind;
    }

    filter(property: string, value: {}): IJournalQueryModel;

    filter(property: string, operator: Operator, value: {}): IJournalQueryModel;

    filter(property: string, operator?: Operator, value?: {}): IJournalQueryModel {
        logger.info('In datastore.IbmDocDbQuery.filter.');
        logger.info('in filter("esd","=",esd)');
        logger.debug(property);
        logger.debug(operator);
        logger.debug(value);

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

        logger.info('modified values');
        logger.debug(property);
        logger.debug(operator);
        logger.debug(value);

        let cdbOperator;

        switch (operator) {
            case ConditionalOperators.Equal:
                cdbOperator = CouchOperators.Equal;
                break;
            case ConditionalOperators.GreaterThan:
                cdbOperator = CouchOperators.GreaterThan
                break;
            case ConditionalOperators.GreaterThanEqualTo:
                cdbOperator = CouchOperators.GreaterThanEqualTo
                break;
            case ConditionalOperators.LesserThan:
                cdbOperator = CouchOperators.LesserThan
                break;
            case ConditionalOperators.LesserThanEqualTo:
                cdbOperator = CouchOperators.LesserThanEqualTo
                break;
            case ConditionalOperators.Contains:
                cdbOperator = CouchOperators.Contains
                break;
        }

        logger.debug('cdbOperator - ' + cdbOperator);

        const filter = new IbmQueryFilter(property, cdbOperator, value);
        this.filters.push(filter);
        logger.debug(filter);
        return this;
    }

    start(start: string | Buffer): IJournalQueryModel {
        logger.info('In datastore.IbmDocDbQuery.start. Have to work on this.');
        return this;
    }

    limit(n: number): IJournalQueryModel {
        logger.info('In datastore.IbmDocDbQuery.limit.');
        this.pagingLimit = n;
        logger.debug(this.pagingLimit);
        return this;
    }

    groupBy(fieldNames: string | string[]): IJournalQueryModel {
        logger.info('In datastore.IbmDocDbQuery.groupBy. Have to work on this.');
        logger.debug(fieldNames);
        return this;
    }

    // field names added to query. Returned in the response if they exists.
    select(fieldNames: string | string[]): IJournalQueryModel {
        // if you wondering, converts string to an array
        logger.info('In datastore.IbmDocDbQuery.select.');
        logger.debug(fieldNames);
        if (typeof fieldNames === 'string') {
            this.projectedFieldNames = [fieldNames];
        } else {
            this.projectedFieldNames = fieldNames;
        }
        return this;
    }

    private filters: IbmQueryFilter[] = [];
    private projectedFieldNames: string[] = [];
    private groupByFieldNames: string[] = [];
    private pagingStart?: string;
    private pagingLimit?: number;

    // public prepareSqlStatement(tableName: string): { spec: SqlQuerySpec, options: FeedOptions } {
    public prepareStatement(tableName: string, namespace: string, kind: string): any {
        logger.info('In datastore.IbmDocDbQuery.prepareStatement.');
        logger.debug(tableName);
        logger.debug(namespace);
        logger.debug(kind);
        const builder = new QueryStatementBuilder(tableName, namespace, kind);
        logger.debug(builder);

        for (const filter of this.filters) {
            filter.addFilterExpression(builder);
        }

        builder.projectedFieldNames = this.projectedFieldNames;
        builder.pagingLimit = this.pagingLimit;
        /*builder.groupByFieldNames = this.groupByFieldNames;*/ // working on basic query

        const spec = builder.build();
        logger.debug(spec);
        return spec;
    }

}


class IbmQueryFilter {

    public constructor(property: string, operator: string, value: {}) {
        logger.info('In datastore.IbmQueryFilter.constructor.');
        this.property = property;
        this.operator = operator;
        this.value = value;
        logger.debug(this.property);
        logger.debug(this.operator);
        logger.debug(this.value);
    }

    public property: string;

    public operator: string;

    public value: {};

    public addFilterExpression(toStatement: QueryStatementBuilder) {
        logger.info('In datastore.IbmQueryFilter.addFilterExpression.');
        logger.debug(toStatement);
        toStatement.addFilterExpression(this.property, this.operator, this.value);
    }
}

class QueryStatementBuilder {
    public tableName: string;
    public namespace: string;
    public kind: string;
    private filterExpressions: string[] = [];
    public projectedFieldNames: string[] = [];
    public pagingLimit?: number;

    constructor(tableName: string, namespace: string, kind: string) {
        logger.info('In datastore.QueryStatementBuilder.constructor.');
        this.tableName = tableName;
        this.namespace = namespace;
        this.kind = kind;
        logger.debug(this.tableName);
        logger.debug(this.namespace);
        logger.debug(this.kind);
    }

    public addFilterExpression(property: string, operator: string, value: {}) {
        logger.info('In datastore.QueryStatementBuilder.addFilterExpression.');
        logger.debug(property);
        logger.debug(operator);
        logger.debug(value);
        this.filterExpressions.push(
            '{"property": "' + property
            + '", "operator": "' + operator
            + '", "value": "' + value + '"}');
    }

    // public build(): SqlQuerySpec {
    public build(): any {

        logger.info('In datastore.QueryStatementBuilder.build');
        const selectorQuery = {};
        const andWrapper = {};
        andWrapper['$and'] = [];

        const keyQuery = {};
        // let filter = '';
        const fieldsOption = [];

        keyQuery['Symbol(id)'] = { partitionKey: { $eq: this.namespace + '-' + this.kind }, kind: { $eq: this.kind } };
        andWrapper['$and'].push(keyQuery);
        selectorQuery['selector'] = andWrapper;

        for (const filter of this.filterExpressions) {
            const filterObject = JSON.parse(filter);
            const op = filterObject.operator;

            let filterQuery = {};
            if (filterObject.operator === '$elemMatch') {
                logger.debug('$elemMatch operator');
                filterQuery = { [filterObject.property]: { [filterObject.operator]: { '$eq': filterObject.value } } };
            }
            else
                filterQuery = { [filterObject.property]: { [filterObject.operator]: filterObject.value } };
            logger.debug('filterQuery - ');
            logger.debug(filterQuery);
            andWrapper['$and'].push(filterQuery);
        }

        logger.debug('Created query AND clause - ');
        logger.debug(andWrapper);

        if (this.projectedFieldNames.length) {
            selectorQuery[IbmConfig.DOC_DB_QUERY_SELECT_FIELDS] = fieldsOption;
            for (const field of this.projectedFieldNames) {
                fieldsOption.push(field);
            }
        }

        if (this.pagingLimit === undefined)
            this.pagingLimit = IbmConfig.DOC_DB_QUERY_RESULT_LIMIT_VALUE;

        selectorQuery[IbmConfig.DOC_DB_QUERY_RESULT_LIMIT] = this.pagingLimit;
        logger.debug(selectorQuery);
        return selectorQuery;
    }
}
