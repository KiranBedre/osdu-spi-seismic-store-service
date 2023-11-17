import AWS, { DynamoDB } from "aws-sdk";
import { AWSDynamoDbDAO, AWSDynamoDbQuery, AWSDynamoDbTransactionDAO, AWSDynamoDbTransactionOperation } from "../../../../src/cloud/providers/aws/dynamodb";
import sinon from "sinon";
import { Tx } from "../../utils";
import { AWSDataEcosystemServices } from "../../../../src/cloud/providers/aws/dataecosystem";
import { AWSConfig } from "../../../../src/cloud/providers/aws";
import { IJournalQueryModel } from "../../../../src/cloud/journal";
import {Config} from '../../../../src/cloud';

export class TestAWSDynamoDB {
    private static sandbox: sinon.SinonSandbox;
    private static awsDynamoDb: AWSDynamoDbDAO;
    private static awsDynamoDbQuery: AWSDynamoDbQuery;
    private static mockDynamoDb;
    private static putItemStub;
    private static getItemStub;
    private static deleteItemStub;
    private static testTenant: {
        name: string;
        esd: string;
        gcpid: string;
        default_acls: string;
    } = {
        name: 'TestTenant',
        esd: 'testEsd.domain',
        gcpid: 'testGcpId',
        default_acls: 'testDefaultAcls',
    };
    public static run() {
        describe(Tx.testInit('AWS DynamoDB'), () => {

            beforeEach(async () => {
                this.sandbox = sinon.createSandbox();
                this.sandbox.define(Config, 'CLOUDPROVIDER', 'amazon');
                this.sandbox.replace(Config, 'FEATURE_FLAG_LOGGING', false);
                this.sandbox.replace(Config, 'FEATURE_FLAG_TRACE', false);
                this.sandbox.replace(Config, 'FEATURE_FLAG_STACKDRIVER_EXPORTER', false);
                this.putItemStub = this.sandbox.stub().returns({
                    promise: sinon.stub().resolves({})
                });
                this.getItemStub = this.sandbox.stub().returns({
                    promise: sinon.stub().resolves({})
                });
                this.deleteItemStub = this.sandbox.stub().returns({
                    promise: sinon.stub().resolves({})
                });

                // Creating a mock DynamoDB object with the stubbed methods
                this.mockDynamoDb = {
                    putItem: this.putItemStub,
                    getItem: this.getItemStub,
                    deleteItem: this.deleteItemStub
                };
                this.awsDynamoDb = new AWSDynamoDbDAO(this.testTenant, this.mockDynamoDb);

            });

            afterEach(() => {
                this.sandbox.restore();
            });

            this.testGetPartitionTenant();
            this.testGetTableName();
            this.testSave();
            this.testGet();
            this.testDelete();
            this.testCreateQuery();
            this.testRunQuery();
            this.testCreateKey();
            this.getTransaction();
            this.getQueryFilterSymbolContains();
        });
    }

    private static testGetPartitionTenant() {
        Tx.sectionInit('Get Partition Tenant');

        Tx.test(async () => {
            const getTenantIdFromPartitionIDStub = this.sandbox.stub(AWSDataEcosystemServices, 'getTenantIdFromPartitionID').resolves('TestTenant');

            await this.awsDynamoDb.getPartitionTenant();
            
            const tenantTablePrefix = (this.awsDynamoDb as any).tenantTablePrefix;
            Tx.checkTrue(tenantTablePrefix === 'TestTenant');

        });
    }

    private static testGetTableName() {
        Tx.sectionInit('Get Table Name');

        Tx.test(async () => {
            const getPartitionTenantStub = this.sandbox.stub(this.awsDynamoDb, 'getPartitionTenant').resolves();
            (this.awsDynamoDb as any).tenantTablePrefix = 'TestTenant';
    
            const inputTable = 'testTable-123';
            const expectedOutput = 'testTable-TestTenant-123';
    
            const result = await this.awsDynamoDb.getTableName(inputTable);
            Tx.checkTrue(result === expectedOutput);
        });
    }

    private static testSave() {
        Tx.sectionInit('Save');
    
        Tx.test(async () => {
            const getTableNameStub = this.sandbox.stub(this.awsDynamoDb, 'getTableName').resolves('TestTable');
    
            const input = {
                key: {
                    id: 'testId',
                    tableName: 'testTable',
                    tableKind: AWSConfig.DATASETS_KIND,
                    name: "testName",
                    partitionKey: "somePartitionKey" 
                },
                data: {
                    someDataField: 'testData' 
                },
                ctag: 'someCtag' 
            };
    
            await this.awsDynamoDb.save(input);
    
            Tx.checkTrue(getTableNameStub.calledOnce);
            Tx.checkTrue(this.putItemStub.calledOnce);
        }); 
    }

    private static testGet() {
        Tx.sectionInit('Get');

        Tx.test(async () => {
            const getTableNameStub = this.sandbox.stub(this.awsDynamoDb, 'getTableName').resolves('TestTable');
            
            const input = {
                key: {
                    id: 'testId',
                    tableName: 'testTable',
                    tableKind: AWSConfig.DATASETS_KIND,
                    name: "testName",
                    partitionKey: "somePartitionKey" 
                },
                data: {
                    someDataField: 'testData' 
                },
                ctag: 'someCtag' 
            };

            await this.awsDynamoDb.get(input);

            Tx.checkTrue(getTableNameStub.calledOnce);
            Tx.checkTrue(this.getItemStub.calledOnce);

        });
    }

    private static testDelete() {
        Tx.sectionInit('Delete');

        Tx.test(async () => {
            const getTableNameStub = this.sandbox.stub(this.awsDynamoDb, 'getTableName').resolves('TestTable');
            
            const input = {
                key: {
                    id: 'testId',
                    tableName: 'testTable',
                    tableKind: AWSConfig.DATASETS_KIND,
                    name: "testName",
                    partitionKey: "somePartitionKey" 
                },
                data: {
                    someDataField: 'testData' 
                },
                ctag: 'someCtag' 
            };

            await this.awsDynamoDb.delete(input);

            Tx.checkTrue(getTableNameStub.calledOnce);
            Tx.checkTrue(this.deleteItemStub.calledOnce);

        });
    }
    private static testCreateQuery() {
        Tx.sectionInit('Create Query');
        Tx.test(() => {
            const namespace = 'testNamespace';
            const kind = 'testKind';
    
            const result = this.awsDynamoDb.createQuery(namespace, kind);
    
            Tx.checkTrue(result instanceof AWSDynamoDbQuery);
        });
    }

    private static testRunQuery() {
        Tx.sectionInit('Run Query');
        Tx.test(async () => {
            this.sandbox.stub(this.awsDynamoDb, 'getPartitionTenant').resolves();
            const queryMock = {
                namespace: 'test-namespace', 
                kind: AWSConfig.DATASETS_KIND, 
                queryStatement: {
                    FilterExpression: '',
                    ExpressionAttributeNames: {},
                    ExpressionAttributeValues: {},
                },
                getQueryStatement: function(this: typeof queryMock, tableName: string, tenantTablePrefix: string) {
                    return this.queryStatement; 
                },
            } as unknown as AWSDynamoDbQuery;
            const documentClientStub = {
                scan: this.sandbox.stub(),
            };
            this.sandbox.stub(DynamoDB, 'DocumentClient').returns(documentClientStub);

            documentClientStub.scan.returns({
                promise: async () => ({
                    Items: [{ key1: 'value1', key2: 'value2' }],
                    LastEvaluatedKey: undefined,
                }),
            });
            const [scanResults, cursorDetails] = await this.awsDynamoDb.runQuery(queryMock);

            Tx.checkTrue(JSON.stringify(scanResults) === JSON.stringify([{ key1: 'value1', key2: 'value2' }]));
            Tx.checkTrue(JSON.stringify(cursorDetails) === JSON.stringify({ endCursor: undefined }));
        });
    }

    private static testCreateKey() {
        Tx.sectionInit('Create Key');
        Tx.test(() => {
            const specs = {
                namespace: "tenant-subproject-dataset",
                path: [AWSConfig.DATASETS_KIND, 'testName']
            };

            const result = this.awsDynamoDb.createKey(specs);
            const strs = specs.namespace.split('-');
            const expectedValue = `${strs[strs.length - 2]}:${strs[strs.length - 1]}`;
            Tx.checkTrue(result instanceof Object);
            Tx.checkTrue((result as any).partitionKey === expectedValue);
        });

        Tx.test(() => {
            const specs = {
                namespace: "tenant-subproject-dataset",
                path: [AWSConfig.SUBPROJECTS_KIND, 'testName'],
            };

            const result = this.awsDynamoDb.createKey(specs);
            const strs = specs.namespace.split('-');
            const expectedValue = `${strs[strs.length - 1] + ':' + specs.path[1]}`
            Tx.checkTrue(result instanceof Object);
            Tx.checkTrue((result as any).partitionKey === expectedValue);
        });

        Tx.test(() => {
            const specs = {
                namespace: "tenant-subproject-dataset",
                path: [AWSConfig.APPS_KIND, 'testName'],
            };

            const result = this.awsDynamoDb.createKey(specs);
            const strs = specs.namespace.split('-');
            const expectedValue = `${strs[strs.length - 1] + ':' + specs.path[1]}`
            Tx.checkTrue(result instanceof Object);
            Tx.checkTrue((result as any).partitionKey === expectedValue);
        });
    }

    private static getTransaction() {
        Tx.sectionInit('Get Transaction');
        Tx.test(() => {
            const result = this.awsDynamoDb.getTransaction();
            Tx.checkTrue(result instanceof AWSDynamoDbTransactionDAO);
        });
    }

    private static getQueryFilterSymbolContains() {
        Tx.sectionInit('Get Query Filter Symbol Contains');
        Tx.test(() => {
            const result = this.awsDynamoDb.getQueryFilterSymbolContains();
            Tx.checkTrue(result === 'CONTAINS');
        });
    }
}

export class TestAWSDynamoDbTransactionDAO {
    private static sandbox: sinon.SinonSandbox;
    private static awsDynamoDbTransaction: AWSDynamoDbTransactionDAO;
    private static awsDynamoDbDAO: AWSDynamoDbDAO;
    private static testTenant: {
        name: string;
        esd: string;
        gcpid: string;
        default_acls: string;
    } = {
        name: 'TestTenant',
        esd: 'testEsd.domain',
        gcpid: 'testGcpId',
        default_acls: 'testDefaultAcls',
    };
    public static run() {
        describe(Tx.testInit('AWS DynamoDB Transaction'), () => {

            beforeEach(async () => {
                AWS.config.update({region: 'us-west-2'});
                this.sandbox = sinon.createSandbox();
                this.sandbox.define(Config, 'CLOUDPROVIDER', 'amazon');
                this.sandbox.replace(Config, 'FEATURE_FLAG_LOGGING', false);
                this.sandbox.replace(Config, 'FEATURE_FLAG_TRACE', false);
                this.sandbox.replace(Config, 'FEATURE_FLAG_STACKDRIVER_EXPORTER', false);
                this.awsDynamoDbDAO = new AWSDynamoDbDAO(this.testTenant);
                this.awsDynamoDbTransaction = new AWSDynamoDbTransactionDAO(this.awsDynamoDbDAO);
            });

            afterEach(() => {
                this.sandbox.restore();
            });
            this.testSave();
            this.testGet();
            this.testDelete();
            this.testCreateQuery();
            this.testRunQuery();
            this.testRun();
            this.testRollback();
            this.testCommit();
        });
    }

    public static testSave() {
        Tx.sectionInit('Save');

        Tx.test(async () => {
            this.awsDynamoDbTransaction.queuedOperations = [];
            const entity = { key: 'testKey', value: 'testValue' };

            await this.awsDynamoDbTransaction.save(entity);
            Tx.checkTrue(this.awsDynamoDbTransaction.queuedOperations.length === 1);
        });
    }

    public static testGet() {
        Tx.sectionInit('Get');

        Tx.test(async () => {
            this.awsDynamoDbTransaction.queuedOperations = [];
            const key = 'testKey';
            const getStub = this.sandbox.stub(this.awsDynamoDbDAO, 'get').resolves([{ key: 'testKey', value: 'testValue'}]);
            const result = await this.awsDynamoDbTransaction.get(key);
            
            Tx.checkTrue(JSON.stringify(result) === JSON.stringify([{ key: 'testKey', value: 'testValue'}]));
        });
    }

    public static testDelete() {
        Tx.sectionInit('Delete');

        Tx.test(async () => {
            this.awsDynamoDbTransaction.queuedOperations = [];
            const entity = { key: 'testKey', value: 'testValue' };

            await this.awsDynamoDbTransaction.delete(entity);
            Tx.checkTrue(this.awsDynamoDbTransaction.queuedOperations.length === 1);
        });
    }

    public static testCreateQuery() {
        Tx.sectionInit('Create Query');
        Tx.test(() => {
            const namespace = 'testNamespace';
            const kind = 'testKind';
    
            const result = this.awsDynamoDbTransaction.createQuery(namespace, kind);
    
            Tx.checkTrue(result instanceof AWSDynamoDbQuery);
        });
    }

    public static testRunQuery() {
        Tx.sectionInit('Run Query');

        Tx.test(async () => {
            const queryMock = {
                namespace: 'test-namespace', 
                kind: AWSConfig.DATASETS_KIND, 
                queryStatement: {
                    FilterExpression: '',
                    ExpressionAttributeNames: {},
                    ExpressionAttributeValues: {},
                },
                getQueryStatement: function(this: typeof queryMock, tableName: string, tenantTablePrefix: string) {
                    return this.queryStatement; 
                },
            } as unknown as AWSDynamoDbQuery;
            const runQueryStub = this.sandbox.stub(this.awsDynamoDbDAO, 'runQuery').resolves([[], { endCursor: undefined }]);
            const [scanResults, cursorDetails] = await this.awsDynamoDbTransaction.runQuery(queryMock);

            Tx.checkTrue(JSON.stringify(scanResults) === JSON.stringify([]));
            Tx.checkTrue(JSON.stringify(cursorDetails) === JSON.stringify({ endCursor: undefined }));
        });
    }

    public static testRun() {
        Tx.sectionInit('Run');

        Tx.test(async () => {
            this.awsDynamoDbTransaction.queuedOperations = [new AWSDynamoDbTransactionOperation('save', { key: 'testKey', value: 'testValue' })];
            try {
                await this.awsDynamoDbTransaction.run();
                Tx.checkFalse(true);
            } catch (error) {
                Tx.checkTrue(error === 'Transaction is already in use.');
            }
        });

        Tx.test(async () => {
            this.awsDynamoDbTransaction.queuedOperations = [];
            try {
                await this.awsDynamoDbTransaction.run();
            } catch (error) {
                Tx.checkFalse(true);
            }
        });
    }

    public static testRollback() {
        Tx.sectionInit('Rollback');

        Tx.test(async () => {
            this.awsDynamoDbTransaction.queuedOperations = [new AWSDynamoDbTransactionOperation('save', { key: 'testKey', value: 'testValue' })];
            
            await this.awsDynamoDbTransaction.rollback();
            Tx.checkTrue(this.awsDynamoDbTransaction.queuedOperations.length === 0);
        });
    }

    public static testCommit() {
        Tx.sectionInit('Commit');

        Tx.test(async () => {
            this.awsDynamoDbTransaction.queuedOperations = [new AWSDynamoDbTransactionOperation('save', { key: 'testKey', value: 'testValue' })];
            const saveStub = this.sandbox.stub(this.awsDynamoDbDAO, 'save').resolves();

            await this.awsDynamoDbTransaction.commit();

            Tx.checkTrue(saveStub.calledOnce);
            Tx.checkTrue(this.awsDynamoDbTransaction.queuedOperations.length === 0);
        });

        Tx.test(async () => {
            this.awsDynamoDbTransaction.queuedOperations = [new AWSDynamoDbTransactionOperation('delete', { key: 'testKey', value: 'testValue' })];
            const deleteStub = this.sandbox.stub(this.awsDynamoDbDAO, 'delete').resolves();

            await this.awsDynamoDbTransaction.commit();

            Tx.checkTrue(deleteStub.calledOnce);
            Tx.checkTrue(this.awsDynamoDbTransaction.queuedOperations.length === 0);
        });
    }

    public static testGetQueryFilterSymbolContains() {
        Tx.sectionInit('Get Query Filter Symbol Contains');
        Tx.test(() => {
            const result = this.awsDynamoDbTransaction.getQueryFilterSymbolContains();
            Tx.checkTrue(result === 'CONTAINS');
        });
    }
}

export class TestAWSDynamoDbQuery {
    private static sandbox: sinon.SinonSandbox;
    private static awsDynamoDbQuery: AWSDynamoDbQuery;

    public static run() {
        describe(Tx.testInit('AWS DynamoDB Query'), () => {

            beforeEach(async () => {
                this.sandbox = sinon.createSandbox();
                this.sandbox.define(Config, 'CLOUDPROVIDER', 'amazon');
                this.sandbox.replace(Config, 'FEATURE_FLAG_LOGGING', false);
                this.sandbox.replace(Config, 'FEATURE_FLAG_TRACE', false);
                this.sandbox.replace(Config, 'FEATURE_FLAG_STACKDRIVER_EXPORTER', false);
                this.awsDynamoDbQuery = new AWSDynamoDbQuery('testNamespace', 'testKind');
            });

            afterEach(() => {
                this.sandbox.restore();
            });
            this.testFilter();
            this.testStart();
            this.testLimit();
            this.testGroupBy();
            this.testSelect();
            this.testGetQueryStatement();
        });
    }

    public static testFilter() {
        Tx.sectionInit('Filter');

        Tx.test(() => {
            const property = 'testProperty';
            const value = { someKey: 'someValue' };
    
            const result: IJournalQueryModel = this.awsDynamoDbQuery.filter(property, value);
    
            Tx.checkTrue(!!this.awsDynamoDbQuery.queryStatement.FilterExpression && this.awsDynamoDbQuery.queryStatement.FilterExpression.includes(property));
            Tx.checkTrue(!!this.awsDynamoDbQuery.queryStatement.ExpressionAttributeValues && this.awsDynamoDbQuery.queryStatement.ExpressionAttributeValues[':' + property] === value);
        });

        Tx.test(() => {
            const property = 'testProperty';
            const value = { someKey: 'someValue' };
            const operator = '=';
    
            // Reset the queryStatement for this test
            this.awsDynamoDbQuery.queryStatement = { TableName: "testTable",FilterExpression: '', ExpressionAttributeNames: {}, ExpressionAttributeValues: {} };
    
            let result: IJournalQueryModel = this.awsDynamoDbQuery.filter(property, operator, value);
    
            Tx.checkTrue(!!this.awsDynamoDbQuery.queryStatement.FilterExpression && this.awsDynamoDbQuery.queryStatement.FilterExpression.includes(operator));
            Tx.checkTrue(this.awsDynamoDbQuery.queryStatement.ExpressionAttributeValues?.[':' + property] === value);
        });

        Tx.test(() => {
            const property = 'testProperty';
            const value = { someKey: 'someValue' };
    
            // Test CONTAINS operator
            const result_CONTAINS = this.awsDynamoDbQuery.filter(property, 'CONTAINS', value);
    
            Tx.checkTrue(result_CONTAINS !== undefined);
            Tx.checkTrue(!!this.awsDynamoDbQuery.queryStatement.FilterExpression && this.awsDynamoDbQuery.queryStatement.FilterExpression.includes('contains(#' + property));
            Tx.checkTrue(this.awsDynamoDbQuery.queryStatement.ExpressionAttributeValues?.[':' + property] === value);
        });

        Tx.test(() => {
            const property = 'testProperty';
            const value = { someKey: 'someValue' };
    
            try {
                // Test HAS_ANCESTOR operator, expecting it to throw an error
                this.awsDynamoDbQuery.filter(property, 'HAS_ANCESTOR', value);
            } catch (e) {
                Tx.checkTrue(e.message === 'HAS_ANCESTOR operator is not supported in query filters.');
            }
        });

        Tx.test(() => {
            const property = 'path';
            const value = { someKey: 'someValue' };
            
            // Test with 'path' property
            const result_path = this.awsDynamoDbQuery.filter(property, '=', value);
            
            Tx.checkTrue(result_path !== undefined);
            Tx.checkTrue(!!this.awsDynamoDbQuery.queryStatement.FilterExpression && this.awsDynamoDbQuery.queryStatement.FilterExpression.includes('#p='));
            Tx.checkTrue(this.awsDynamoDbQuery.queryStatement.ExpressionAttributeValues?.[':p'] === value);
        });

        Tx.test(() => {
            const property = 'testProperty';
            
            // Test undefined value
            const result_undefined = this.awsDynamoDbQuery.filter(property, '=');
            
            Tx.checkTrue(result_undefined !== undefined);
            Tx.checkTrue(!!this.awsDynamoDbQuery.queryStatement.FilterExpression && this.awsDynamoDbQuery.queryStatement.FilterExpression.includes('#' + property + '='));
        });
    }

    public static testStart() {
        Tx.sectionInit('Start');

        Tx.test(() => {
            const start = "testStart";
    
            const result: IJournalQueryModel = this.awsDynamoDbQuery.start(start);
    
            Tx.checkTrue(result instanceof AWSDynamoDbQuery);
        });

        Tx.test(() => {
            const start: Buffer = Buffer.from("testStart");
    
            try {
                this.awsDynamoDbQuery.start(start);
            }
            catch (e) {
                Tx.checkTrue(e.message === 'Type \'Buffer\' is not supported for DynamoDB Continuation while paging.');
            }
        });
    }

    public static testLimit() {
        Tx.sectionInit('Limit');

        Tx.test(() => {
            const limit = 10;
    
            const result: IJournalQueryModel = this.awsDynamoDbQuery.limit(limit);
    
            Tx.checkTrue(this.awsDynamoDbQuery.queryStatement.Limit === limit);
        });
    }

    public static testGroupBy() {
        Tx.sectionInit('Group By');

        Tx.test(() => {
            const fieldNames = ['testField1', 'testField2'];

            const result: IJournalQueryModel = this.awsDynamoDbQuery.groupBy(fieldNames);

            Tx.checkTrue(result instanceof AWSDynamoDbQuery);
        });
    }

    public static testSelect() {
        Tx.sectionInit('Select');

        // Test case when fieldNames is a string
        Tx.test(() => {
            const fieldName = 'testField';
            const result = this.awsDynamoDbQuery.select(fieldName);

            Tx.checkTrue(result !== undefined);
            Tx.checkTrue(!!this.awsDynamoDbQuery.queryStatement.ProjectionExpression && this.awsDynamoDbQuery.queryStatement.ProjectionExpression.includes(fieldName));
        });

        // Test case when fieldNames is an array and the first element is not 'path'
        Tx.test(() => {
            const fieldNames = ['field1', 'field2'];
            const result = this.awsDynamoDbQuery.select(fieldNames);

            Tx.checkTrue(result !== undefined);
            Tx.checkTrue(!!this.awsDynamoDbQuery.queryStatement.ProjectionExpression && this.awsDynamoDbQuery.queryStatement.ProjectionExpression.includes(fieldNames.join(',')));
        });

        // Test case when fieldNames is an array and the first element is 'path'
        Tx.test(() => {
            const fieldNames = ['path', 'field2'];
            const result = this.awsDynamoDbQuery.select(fieldNames);

            Tx.checkTrue(result !== undefined);
            Tx.checkTrue(!!this.awsDynamoDbQuery.queryStatement.ProjectionExpression && this.awsDynamoDbQuery.queryStatement.ProjectionExpression.includes('#p'));
        });

        // Test case to check the comma addition when ProjectionExpression already has some length
        Tx.test(() => {
            const fieldNames1 = ['field1'];
            const fieldNames2 = ['field2', 'field3'];
            let result = this.awsDynamoDbQuery.select(fieldNames1);
            result = result.select(fieldNames2);

            Tx.checkTrue(result !== undefined);
            Tx.checkTrue(!!this.awsDynamoDbQuery.queryStatement.ProjectionExpression && this.awsDynamoDbQuery.queryStatement.ProjectionExpression.includes('field1,field2,field3'));
        });
    }

    public static testGetQueryStatement() {
        Tx.sectionInit('Get Query Statement');
        const tableName = 'testTable';
        const tenantTablePrefix = 'testTenant';
        // Test DATASETS_KIND kind
        Tx.test(() => {
            const namespace = 'test-namespace-testTenant-testSubproject';
            this.awsDynamoDbQuery = new AWSDynamoDbQuery(namespace, AWSConfig.DATASETS_KIND);

            const result = this.awsDynamoDbQuery.getQueryStatement(tableName, tenantTablePrefix);

            Tx.checkTrue(result !== undefined);
            Tx.checkTrue(result.TableName === `${AWSConfig.AWS_TENANT_GROUP_NAME}-${tenantTablePrefix}-SeismicStore.${tableName}`);

        });
         // Test SUBPROJECTS_KIND kind
        Tx.test(() => {
            const namespace = 'test-namespace-testTenant';
            this.awsDynamoDbQuery = new AWSDynamoDbQuery(namespace, AWSConfig.SUBPROJECTS_KIND);

            const result = this.awsDynamoDbQuery.getQueryStatement(tableName, tenantTablePrefix);

            Tx.checkTrue(result !== undefined);
            Tx.checkTrue(result.TableName === `${AWSConfig.AWS_TENANT_GROUP_NAME}-${tenantTablePrefix}-SeismicStore.${tableName}`);
            Tx.checkTrue(!!this.awsDynamoDbQuery.queryStatement.FilterExpression && this.awsDynamoDbQuery.queryStatement.FilterExpression.includes('tenant=:tenant'));
        });
        // Test APPS_KIND kind
        Tx.test(() => {
            const namespace = 'test-namespace-testTenant';
            this.awsDynamoDbQuery = new AWSDynamoDbQuery(namespace, AWSConfig.APPS_KIND);

            const result = this.awsDynamoDbQuery.getQueryStatement(tableName, tenantTablePrefix);

            Tx.checkTrue(result !== undefined);
            Tx.checkTrue(result.TableName === `${AWSConfig.AWS_TENANT_GROUP_NAME}-${tenantTablePrefix}-SeismicStore.${tableName}`);
            Tx.checkTrue(!!this.awsDynamoDbQuery.queryStatement.FilterExpression && this.awsDynamoDbQuery.queryStatement.FilterExpression.includes('tenant=:tenant'));
        });

        // Test case with empty FilterExpression and ProjectionExpression
        Tx.test(() => {
            const namespace = 'test-namespace';
            this.awsDynamoDbQuery = new AWSDynamoDbQuery(namespace, 'OTHER_KIND');
            
            // Ensure that ProjectionExpression and FilterExpression are empty
            this.awsDynamoDbQuery.queryStatement.ProjectionExpression = '';
            this.awsDynamoDbQuery.queryStatement.FilterExpression = '';

            const result = this.awsDynamoDbQuery.getQueryStatement(tableName, tenantTablePrefix);

            Tx.checkTrue(result !== undefined);
            Tx.checkTrue(result.TableName === `${AWSConfig.AWS_TENANT_GROUP_NAME}-${tenantTablePrefix}-SeismicStore.${tableName}`);
            Tx.checkTrue(result.FilterExpression === undefined);
            Tx.checkTrue(result.ProjectionExpression === undefined);
            Tx.checkTrue(result.ExpressionAttributeNames === undefined);
            Tx.checkTrue(result.ExpressionAttributeValues === undefined);
        });
    }
}
