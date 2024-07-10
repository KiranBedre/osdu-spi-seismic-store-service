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

import sinon from 'sinon';
import crypto from 'crypto'

import { Container, FeedResponse, Item, Items, QueryIterator, SqlQuerySpec } from '@azure/cosmos';
import { AzureCosmosDbDAO, AzureCosmosDbQuery, AzureConfig, AzureDataEcosystemServices } from '../../../../src/cloud/providers/azure';
import { DatasetModel, AndQueryFilter, MatchQueryFilter, QueryFilter, QueryFilterVisitor } from '../../../../src/services/dataset';
import { Config } from '../../../../src/cloud';
import { IJournalQueryModel } from '../../../../src/cloud/journal';
import { Tx } from '../../utils';
import { CosmosDbTestHelper } from './cosmosdb-test-helper';
import { assert, expect } from 'chai';
import axios, { AxiosInstance } from 'axios';
import { JsonWebTokenError } from 'jsonwebtoken';

export class TestAzureCosmosDbDAO {
    private static sandbox: sinon.SinonSandbox;
    private static cosmos: AzureCosmosDbDAO;
    private static query: AzureCosmosDbQuery;
    private static axiosInstance: AxiosInstance;
    private static buffer: Buffer;
    private static tmpAxios: AxiosInstance;

    public static run() {

        describe(Tx.testInit('azure cosmos db dao test'), () => {
            this.sandbox = sinon.createSandbox();
            // axiosInstance needs to have any kind or "post" method to make it stubble in the tests
            this.axiosInstance = {post () { return; }} as unknown as  AxiosInstance;
            this.cosmos = new AzureCosmosDbDAO({ gcpid: 'gcpid', default_acls: 'x', esd: 'gcpid@domain.com', name: 'gcpid' });
            this.query = new AzureCosmosDbQuery('name-a', 'kind-a');
            
            const iJournalQueryModel: IJournalQueryModel = {
                filter (property: string, value: {}): IJournalQueryModel {
                    return iJournalQueryModel;
                },
                start (start: string | Buffer): IJournalQueryModel {
                    return iJournalQueryModel;
                },
                limit (n: number): IJournalQueryModel {
                    return iJournalQueryModel;
                },
                groupBy (fieldNames: string | string[]): IJournalQueryModel {
                    return iJournalQueryModel;
                },
                select (fieldNames: string | string[]): IJournalQueryModel {
                    return iJournalQueryModel;
                }
            };

            beforeEach(() => {
                this.sandbox.define(Config, 'CLOUDPROVIDER', 'azure');

                this.sandbox.stub(AzureCosmosDbDAO.prototype, 'getCosmoContainer').resolves(
                    new Container(undefined, 'id', undefined));

                // replace axiosInstance to our stub. Unfortunately, we can't do this with sandbox methods.
                this.tmpAxios = AzureCosmosDbDAO.axiosInstance;
                AzureCosmosDbDAO.axiosInstance = this.axiosInstance;
            })

            afterEach(() => {
                AzureCosmosDbDAO.axiosInstance = this.tmpAxios;  // restore Axios instance
                this.sandbox.restore();
            });

            this.getSize();
            this.save();
            this.get();
            this.delete();
            this.createQuery();
            this.runQuery();
            this.createKey();
            this.getTransaction();
            this.getQueryFilterSymbolContains();
            this.queryFilter();
            this.queryFilterBy();
            this.queryStart();
            this.queryLimit();
            this.queryGroupBy();
            this.querySelect();
            this.listFolders();
            this.pathExists();
        });
    }

    private static save() {
        const mockEntity = {
            key: {
                partitionKey: 'testPartitionKey',
                id: 'testId'
            },
            data: {
                id: 'test'
            }
        }

        Tx.sectionInit('save');

        Tx.test(async () => {
            this.sandbox.stub(Items.prototype, 'upsert').resolves(mockEntity.data as any);
            this.cosmos.save(mockEntity).then(res => {
            }).catch(err => {
                assert.fail(err)
            });
        });

    }

    private static get() {
        Tx.sectionInit('get');

        const key = {
            id: 'testId',
            partitionKey: 'testKey',
            kind: 'testKind'
        };

        Tx.test(async () => {
            key.partitionKey = 'dsTestKey';
            this.sandbox.stub(axios, 'get').resolves();
            const mockResult = {
                resource: {
                    data: {
                        id: 'testId',
                        param: 'testParam'
                    }
                }
            } as any;

            this.sandbox.stub(Item.prototype, 'read').returns(mockResult);
            const [result] = await this.cosmos.get(key);
            assert.deepEqual(mockResult.resource.data, result, 'Get returned wrong object');
        });

        Tx.test(async () => {
            const mockResult = {
                resource: {
                    data: {
                        id: 'testId',
                        param: 'testParam'
                    }
                }
            } as any;

            this.sandbox.stub(Item.prototype, 'read').returns(mockResult);
            const [result] = await this.cosmos.get(key);
            assert.deepEqual(mockResult.resource.data, result, 'Get returned wrong object');
        });

        Tx.test(async () => {
            const mockResult = {
                resource: undefined,
                statusCode: 404
            } as any;

            this.sandbox.stub(Item.prototype, 'read').returns(Promise.resolve(mockResult));
            const [res] = await this.cosmos.get(key);
            Tx.checkTrue(res === undefined);
        });

    }

    private static delete() {
        Tx.sectionInit('delete');

        Tx.test(async () => {
            this.sandbox.stub(Item.prototype, 'delete').resolves();
            await this.cosmos.delete({ partitionKey: 'entity' });
        });
    }

    private static createQuery() {
        Tx.sectionInit('createQuery');

        Tx.test( () => {
            const res = this.cosmos.createQuery('namespace', 'kind');
            Tx.checkTrue(res !== undefined);
        });

    }

    private static runQuery() {
        Tx.sectionInit('runQuery');
        const feedResponse: FeedResponse<any> = {
            resources: ['resources'],
            headers: undefined,
            hasMoreResults: false,
            continuation: '',
            continuationToken: 'continuationToken',
            queryMetrics: '',
            requestCharge: 0,
            activityId: ''
        } as any;
        let queryIterator: QueryIterator<any> = CosmosDbTestHelper.getQueryIterator() as any;
        const azureCosmosDbQuery: AzureCosmosDbQuery = {
            filter (property: string, operator?: ('CONTAINS' | '=' | '<' | '>' | '<=' | '>=' | 'HAS_ANCESTOR' | 'RegexMatch') | undefined, value?: {} | undefined): IJournalQueryModel {
                throw new Error('Function not implemented.');
            },
            filterBy(queryFilter: QueryFilter): AzureCosmosDbQuery {
                throw new Error('Function not implemented.');
            },
            start (start: string | Buffer): IJournalQueryModel {
                throw new Error('Function not implemented.');
            },
            limit (n: number): IJournalQueryModel {
                throw new Error('Function not implemented.');
            },
            groupBy (fieldNames: string | string[]): IJournalQueryModel {
                throw new Error('Function not implemented.');
            },
            select (fieldNames: string | string[]): IJournalQueryModel {
                throw new Error('Function not implemented.');
            },
            queryFilter: undefined,
            projectedFieldNames: ['fieldName1'],
            groupByFieldNames: ['groupFieldName1'],
            namespace: 'namespace',
            pagingStart: '"[pagingStart]"',
            pagingLimit: 1,
            kind: ''
        };

        Tx.test(async () => {
            azureCosmosDbQuery.kind = 'subprojects';
            this.sandbox.stub(Items.prototype, 'query').returns(queryIterator);
            const res = await this.cosmos.runQuery(azureCosmosDbQuery as IJournalQueryModel);
            Tx.checkTrue(res[1].endCursor === 'continuationToken');
        });

        Tx.test(async () => {
            azureCosmosDbQuery.kind = 'apps';
            this.sandbox.stub(Items.prototype, 'query').returns(queryIterator);
            const res = await this.cosmos.runQuery(azureCosmosDbQuery as IJournalQueryModel);
            Tx.checkTrue(res[1].endCursor === 'continuationToken');
        });

        Tx.test(async () => {
            azureCosmosDbQuery.kind = 'datasets';
            azureCosmosDbQuery.queryFilter = new MatchQueryFilter('property', 'RegexMatch', {value: 'value'});
            this.sandbox.define(AzureConfig, 'SIDECAR_ENABLE_QUERY', false);
            this.sandbox.stub(Items.prototype, 'query').returns(queryIterator);
            const res = await this.cosmos.runQuery(azureCosmosDbQuery as IJournalQueryModel);
            Tx.checkTrue(res[1].endCursor === 'continuationToken');
        });

        Tx.test(async () => {
            azureCosmosDbQuery.kind = 'datasets';
            azureCosmosDbQuery.queryFilter = new MatchQueryFilter('property', 'RegexMatch', {value: 'value'});
            this.sandbox.define(AzureConfig, 'SIDECAR_ENABLE_QUERY', false);
            azureCosmosDbQuery.pagingStart = '';
            azureCosmosDbQuery.pagingLimit = 0;
            this.sandbox.stub(Items.prototype, 'query').returns(queryIterator);
            const res = await this.cosmos.runQuery(azureCosmosDbQuery as IJournalQueryModel)
            Tx.checkTrue(res[1].endCursor === 'continuationToken');
        });

    }

    private static listFolders() {
        Tx.sectionInit('listFolders');
        const datasetModel: DatasetModel = {
            name: 'name',
            tenant: 'tenant',
            subproject: 'subproject',
            path: '/path/to/the/folder/',
            created_date: '',
            last_modified_date: '',
            created_by: '',
            metadata: undefined,
            filemetadata: undefined,
            gcsurl: '',
            type: '',
            ltag: '',
            ctag: '0000000000000000',
            sbit: '',
            sbit_count: 0,
            gtags: ['gtag1'],
            readonly: false,
            seismicmeta_guid: '',
            transfer_status: '',
            acls: { admins: [], viewers: [] },
            access_policy: ''
        };
        const feedResponse: FeedResponse<any> = {
            resources: ['/path/to/the/folder/', '/path/to/the/folder/folder2/folder3'],
            headers: undefined,
            hasMoreResults: false,
            continuation: '',
            continuationToken: 'continuationToken',
            queryMetrics: '',
            requestCharge: 0,
            activityId: ''
        } as any;
        const queryIterator: QueryIterator<any> = {
            clientContext: undefined,
            query: undefined,
            options: undefined,
            fetchFunctions: undefined,
            fetchAllTempResources: undefined,
            fetchAllLastResHeaders: undefined,
            queryExecutionContext: undefined,
            queryPlanPromise: undefined,
            isInitialized: undefined,
            getAsyncIterator (): AsyncIterable<FeedResponse<any>> {
                throw new Error('Function not implemented.');
            },
            hasMoreResults (): boolean {
                throw new Error('Function not implemented.');
            },
            fetchAll (): Promise<FeedResponse<any>> {
                return Promise.resolve(feedResponse);
            },
            fetchNext (): Promise<FeedResponse<any>> {
                return Promise.resolve(feedResponse);
            },
            reset (): void {
                throw new Error('Function not implemented.');
            },
            toArrayImplementation: undefined,
            createPipelinedExecutionContext: undefined,
            fetchQueryPlan: undefined,
            needsQueryPlan: undefined,
            initPromise: undefined,
            init: undefined,
            _init: undefined,
            handleSplitError: undefined
        } as any;

        const distinctPathsQuery = 'SELECT DISTINCT VALUE c.data.path FROM c WHERE c.data.subproject = @subproject'+
                                    ' AND STARTSWITH(c.data.path, @path, false)';

        const distinctPathsParameters = [{'name': '@subproject','value': 'subproject'},
                                        {'name': '@path','value': '/path/to/the/folder/'}];

        Tx.test(async () => {
            this.sandbox.define(AzureConfig, 'SIDECAR_ENABLE_QUERY', true);

            const axiosInstancePostStub = this.sandbox.stub(this.axiosInstance, 'post').resolves({
                data: { records: [
                    datasetModel.path,
                    datasetModel.path + 'a/b/',
                    datasetModel.path + 'a/b/c/',
                    datasetModel.path + 'a/c/',
                    datasetModel.path + 'b/x/',
                ]}
            });

            const expectedPaths = [
                datasetModel.path + 'a/',
                datasetModel.path + 'b/',
            ]

            this.sandbox.stub(AzureDataEcosystemServices, 'getCosmosConnectionParams').resolves(
                {endpoint: 'myEndpoint', key: 'myKey'});

            const res = await this.cosmos.listFolders(datasetModel);

            const actualPaths = res[0].map(x => x['path']);

            this.sandbox.assert.calledOnceWithExactly(
                axiosInstancePostStub,
                AzureConfig.SIDECAR_URL + '/query',
                {
                    cs: 'AccountEndpoint=myEndpoint;AccountKey=myKey;',
                    sql: distinctPathsQuery,
                    parameters: JSON.stringify(distinctPathsParameters),
                    corrid: undefined
                },
            );

            expect(actualPaths).to.have.same.members(expectedPaths);
        
        });

        Tx.test(async () => {
            this.sandbox.define(AzureConfig, 'SIDECAR_ENABLE_QUERY', false);
            const itemsQueryStub = this.sandbox.stub(Items.prototype, 'query');
            itemsQueryStub.returns(queryIterator);
            const res = await this.cosmos.listFolders(datasetModel);
            this.sandbox.assert.calledOnceWithExactly(itemsQueryStub, {query: distinctPathsQuery, parameters: distinctPathsParameters});

        });

        Tx.test(async () => {
            this.sandbox.define(AzureConfig, 'SIDECAR_ENABLE_QUERY', false);

            const expectedPaths = [
                datasetModel.path + 'folder2/',
            ]

            const itemsQueryStub = this.sandbox.stub(Items.prototype, 'query');
            itemsQueryStub.returns(queryIterator);
            const res = await this.cosmos.listFolders(datasetModel);
            const actualPaths = res[0].map(x => x['path']);
            expect(actualPaths).to.have.same.members(expectedPaths);

        });

    }

    private static getSize() {
      Tx.sectionInit("getSize");

      let subproject = "subproject1";
      let path = "path1";
      let name = "name1";
      const expectedQuery: SqlQuerySpec = {
        query:
          "SELECT count(1) as count, SUM(c.data.computed_size) as size_bytes FROM c WHERE c.data.subproject = @subproject",
        parameters: [
          { name: "@subproject", value: subproject },
        ],
      };
        this.getSizeCase(
        {
          subproject: subproject,
        } as DatasetModel,
        {
          query:
            "SELECT count(1) as count, SUM(c.data.computed_size) as size_bytes FROM c WHERE c.data.subproject = @subproject",
          parameters: [
            { name: "@subproject", value: subproject },
          ],
        }
      );

      this.getSizeCase(
        {
          subproject: subproject,
          path: path,
        } as DatasetModel,
        {
          query:
            "SELECT count(1) as count, SUM(c.data.computed_size) as size_bytes FROM c WHERE c.data.subproject = @subproject AND STARTSWITH(c.data.path, @path, false)",
          parameters: [
            { name: "@subproject", value: subproject },
            { name: "@path", value: path },
          ],
        }
      );

      this.getSizeCase(
        {
          subproject: subproject,
          path: path,
          name: name,
        } as DatasetModel,
        {
          query:
            "SELECT count(1) as count, SUM(c.data.computed_size) as size_bytes FROM c WHERE c.data.subproject = @subproject AND c.data.name = @name AND STARTSWITH(c.data.path, @path, false)",
          parameters: [
            { name: "@subproject", value: subproject },
            { name: "@name", value: name }, 
            { name: "@path", value: path },
          ],
        }
      );

      Tx.test(async () => {
          const dataset = {
              subproject: subproject,
              name: name,
          } as DatasetModel;
          this.sandbox.define(AzureConfig, 'SIDECAR_ENABLE_QUERY', false);

          try {
              await this.cosmos.getSize(dataset);
          } catch (error) {
              expect(error.error.message).to.equal("[seismic-store-service] Path needs to be provided.");
              expect(error.error.status).to.equal("BAD_REQUEST");
              expect(error.error.code).to.equal(400);
          }
      });
    }

    private static getSizeCase(dataset: DatasetModel, expectedQuery: SqlQuerySpec) {
        const size_bytes = 56;
        const count = 34;
        const mockResult = [
          {
            size_bytes: size_bytes,
            count: count,
          },
        ] as any;
        let queryIterator: QueryIterator<any> = CosmosDbTestHelper.getQueryIterator(
          mockResult
        ) as any;

        Tx.test(async () => {
          this.sandbox.define(AzureConfig, 'SIDECAR_ENABLE_QUERY', false);
          let sinonStub = this.sandbox.stub(Items.prototype, "query");

          sinonStub.returns(queryIterator);

          let res = await this.cosmos.getSize(dataset);
          expect(res).to.deep.equal({
            size_bytes: size_bytes,
            dataset_count: count,
          });

          sinon.assert.calledWith(sinonStub, expectedQuery);
        });
    }


    private static createKey() {
        Tx.sectionInit('create key');

        Tx.test(async () => {
            const specs = {
                namespace: 'testNamespace',
                path: [AzureConfig.TENANTS_KIND, 'tnName']
            }

            const expectedKey = { partitionKey: 'tn-tnName', name: 'tnName' }

            const key = this.cosmos.createKey(specs);
            assert.deepEqual(key, expectedKey, 'Keys do not match');
        });

        Tx.test(async () => {
            const specs = {
                namespace: 'testNamespace',
                path: [AzureConfig.SUBPROJECTS_KIND, 'spName']
            }

            const expectedKey = { partitionKey: 'sp-spName', name: 'spName' }

            const key = this.cosmos.createKey(specs);
            assert.deepEqual(key, expectedKey, 'Keys do not match');
        });

        Tx.test(async () => {
            const specs = {
                namespace: Config.SEISMIC_STORE_NS + '-tenant-sp',
                path: [Config.DATASETS_KIND],
                enforcedKey: '/path/name'
            }
            const partitionKey = 'ds-tenant-sp-' + crypto.createHash('sha512').update('/path/name').digest('hex');
            const expectedKey = { partitionKey, name: 'name' }

            const key = this.cosmos.createKey(specs) as { name: string, partitionKey: string, kind: string };
            assert.deepEqual(key, expectedKey, 'Keys do not match');
        });

        Tx.test(async () => {
            const specs = {
                namespace: 'testNamespace',
                path: [AzureConfig.APPS_KIND, 'apName']
            }

            const expectedKey = { partitionKey: 'ap-apName', name: 'apName' }

            const key = this.cosmos.createKey(specs);
            assert.deepEqual(key, expectedKey, 'Keys do not match');
        });
    }

    private static getTransaction() {
        Tx.sectionInit('getTransaction');

        Tx.test( () => {
            const res = this.cosmos.getTransaction();
            Tx.checkTrue(res !== undefined);
        });

    }

    private static getQueryFilterSymbolContains() {
        Tx.sectionInit('getQueryFilterSymbolContains');

        Tx.test( () => {
            const res = this.cosmos.getQueryFilterSymbolContains();
            Tx.checkTrue(res === "CONTAINS");
        });

    }

    private static queryFilter() {
        Tx.sectionInit('filter');

        this.resetQueryFilter();

        Tx.test(() => {
            const res = this.query.filter('property');
            Tx.checkTrue(res === this.query );

        });

        Tx.test( () => {
            const res = this.query.filter('property', undefined, undefined);
            Tx.checkTrue(res === this.query );

        });

        Tx.test( () => {
            const res = this.query.filter('', undefined, undefined);
            Tx.checkTrue(res === this.query );

        });

        Tx.test( () => {
            const res = this.query.filter('property', '=', {});
            Tx.checkTrue(res === this.query );

        });
    }


    private static queryFilterBy() {
        Tx.sectionInit('filterBy');

        this.resetQueryFilter();

        class StubFilter implements QueryFilter {
            public accept(visitor: QueryFilterVisitor): void {
                throw new Error('Function not implemented.');
            }

        }

        const filter1 = new StubFilter();

        Tx.test(() => {
            const res = this.query.filterBy(filter1);
            Tx.checkTrue(res === this.query);
            Tx.checkTrue(this.query.queryFilter === filter1);

        });

        Tx.test(() => {
            this.query = new AzureCosmosDbQuery('name-a', 'kind-a');
            const res = this.query.filterBy(filter1);
            Tx.checkTrue(res === this.query);
            Tx.checkTrue(this.query.queryFilter === filter1);

        });

        Tx.test(() => {
            const filter2 = new StubFilter();
            const res = this.query.filterBy(filter2);
            Tx.checkTrue(res === this.query);
            Tx.checkTrue(this.query.queryFilter instanceof AndQueryFilter);
            const filters = (this.query.queryFilter as AndQueryFilter).filters;
            Tx.checkTrue(filters.length == 2);
            Tx.checkTrue(filters[0] === filter1);
            Tx.checkTrue(filters[1] === filter2);
        });

    }

    private static resetQueryFilter() {
        Tx.test(() => {
            this.query = new AzureCosmosDbQuery('name-a', 'kind-a');
            Tx.checkTrue(this.query.queryFilter === undefined);
        });
    }

    private static queryStart() {
        Tx.sectionInit('Start');

        Tx.test( () => {
            const res = this.query.start('start');
            Tx.checkTrue(res === this.query );

        });

        Tx.test( () => {
            const start = {} as Buffer;
            const res = this.query.start(start);
            Tx.checkTrue(res === this.query );

        });
    }


    private static queryLimit() {
        Tx.sectionInit('Limit');

        Tx.test( () => {
            const res = this.query.limit(1);
            Tx.checkTrue(res === this.query );

        });
    }

    private static queryGroupBy() {
        Tx.sectionInit('groupBy');

        Tx.test( () => {
            const res = this.query.groupBy('fieldName');
            Tx.checkTrue(res === this.query );

        });

        Tx.test( () => {
            const res = this.query.groupBy([]);
            Tx.checkTrue(res === this.query );

        });
    }

    private static querySelect() {
        Tx.sectionInit('Select');

        Tx.test( () => {
            const res = this.query.select('fieldName');
            Tx.checkTrue(res === this.query );

        });

        Tx.test( () => {
            const res = this.query.select([]);
            Tx.checkTrue(res === this.query );

        });
    }

    private static pathExists() {
        let tenant = 'tenant'
        let subproject = 'subproject'
        let path = 'path'

        Tx.sectionInit('pathExists');

        const query = 'select top 1 * from c where c.data.subproject = @subproject and STARTSWITH(c.data.path, @path)';
        let queryIterator: QueryIterator<any> = CosmosDbTestHelper.getQueryIterator() as any;

        Tx.test(async () => {
            let sinonStub = this.sandbox.stub(Items.prototype, 'query');
            sinonStub.returns(queryIterator);

            const dataset: DatasetModel = {} as DatasetModel;
            dataset.tenant = tenant;
            dataset.subproject = subproject;

            let res = await this.cosmos.pathExists(subproject, path);
            sinon.assert.calledWith(sinonStub, {
                query: query,
                parameters: [
                    { name: '@subproject', value: subproject },
                    { name: '@path', value: path }
                ]
            });
        });
    }

}
