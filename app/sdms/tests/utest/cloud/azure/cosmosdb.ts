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

import sinon from 'sinon';
import crypto from 'crypto'

import { Conflict, Container, ContainerDefinition, ContainerResponse, FeedOptions, FeedResponse, Item, Items, OfferResponse, PartitionedQueryExecutionInfo, PartitionKeyDefinition, PartitionKeyRange, QueryIterator, RequestOptions, ResourceResponse, Response, SqlQuerySpec } from '@azure/cosmos';
import { AzureCosmosDbDAO, AzureCosmosDbQuery, AzureCosmosDbTransactionDAO } from '../../../../src/cloud/providers/azure/cosmosdb';
import { DatasetModel, PaginationModel } from '../../../../src/services/dataset';
import { AzureDataEcosystemServices } from '../../../../src/cloud/providers/azure';
import { Config, IJournal, IJournalTransaction } from '../../../../src/cloud';
import { IJournalQueryModel } from '../../../../src/cloud/journal';
import { Tx } from '../../utils';
import {assert, expect} from 'chai';
import { AzureConfig } from '../../../../src/cloud/providers/azure';
import { HighlightSpanKind } from 'typescript';
import { query } from 'winston';
import axios, { AxiosInstance, AxiosResponse } from 'axios';

export class TestAzureCosmosDbDAO {
    private static sandbox: sinon.SinonSandbox;
    private static cosmos: AzureCosmosDbDAO;
    private static query: AzureCosmosDbQuery;
    private static axiosInstance: AxiosInstance;
    private static buffer: Buffer;

    public static run() {

        describe(Tx.testInit('azure cosmos db dao test'), () => {
            Config.CLOUDPROVIDER = 'azure';
            this.sandbox = sinon.createSandbox();
            // axiosInstance needs to have any kind or "post" method to make it stubbable in the tests
            this.axiosInstance = {post () { return; }} as unknown as  AxiosInstance;
            this.cosmos = new AzureCosmosDbDAO({ gcpid: 'gcpid', default_acls: 'x', esd: 'gcpid@domain.com', name: 'gcpid' }, this.axiosInstance);
            this.query = new AzureCosmosDbQuery('name-a', 'kind-a');

            const datasetModel: DatasetModel = {
                name: 'name',
                tenant: 'tenant',
                subproject: 'subproject',
                path: 'sd://tenant/subproject/path/mydata.txt',
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
                this.sandbox.stub(AzureCosmosDbDAO.prototype, 'getCosmoContainer').resolves(
                    new Container(undefined, 'id', undefined));
            })

            afterEach(() => {
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
            this.queryStart();
            this.queryLimit();
            this.querygroupBy();
            this.listDatasets();
            this.listFolders();
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

        Tx.test(async (done: any) => {
            this.sandbox.stub(Items.prototype, 'upsert').resolves(mockEntity.data as any);
            this.cosmos.save(mockEntity).then(res => {
                done();
            }).catch(err => {
                assert.fail(err)
                done();
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

        Tx.test(async (done: any) => {
            key.partitionKey = 'dstestKey';
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
            done();
        });

        Tx.test(async (done: any) => {
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
            done();
        });

        Tx.test(async (done: any) => {
            const mockResult = {
                resource: undefined,
                statusCode: 404
            } as any;

            this.sandbox.stub(Item.prototype, 'read').returns(Promise.resolve(mockResult));
            const [res] = await this.cosmos.get(key);
            Tx.checkTrue(res === undefined, done);
        });

    }

    private static delete() {
        Tx.sectionInit('delete');

        Tx.test(async (done: any) => {
            this.sandbox.stub(Item.prototype, 'delete').resolves();
            await this.cosmos.delete({ partitionKey: 'entity' });
            done();
        });
    }

    private static createQuery() {
        Tx.sectionInit('createQuery');

        Tx.test( (done: any) => {
            const res = this.cosmos.createQuery('namespace', 'kind');
            Tx.checkTrue(res !== undefined, done);
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
        let queryIterator: QueryIterator<any> = this.getQueryIterator() as any;
        const azureCosmosDbQuery: AzureCosmosDbQuery = {
            filter (property: string, operator?: ('CONTAINS' | '=' | '<' | '>' | '<=' | '>=' | 'HAS_ANCESTOR' | 'RegexMatch') | undefined, value?: {} | undefined): IJournalQueryModel {
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
            filters: [],
            projectedFieldNames: ['fieldName1'],
            groupByFieldNames: ['groupfieldName1'],
            namespace: 'namespace',
            pagingStart: '"[pagingStart]"',
            pagingLimit: 1,
            kind: ''
        };

        Tx.test( async(done: any) => {
            azureCosmosDbQuery.kind = 'subprojects';
            this.sandbox.stub(Items.prototype, 'query').returns(queryIterator);
            const res = await this.cosmos.runQuery(azureCosmosDbQuery as IJournalQueryModel);
            Tx.checkTrue(res[1].endCursor === 'continuationToken', done);
        });

        Tx.test( async(done: any) => {
            azureCosmosDbQuery.kind = 'apps';
            this.sandbox.stub(Items.prototype, 'query').returns(queryIterator);
            const res = await this.cosmos.runQuery(azureCosmosDbQuery as IJournalQueryModel);
            Tx.checkTrue(res[1].endCursor === 'continuationToken', done);
        });

        Tx.test( async(done: any) => {
            azureCosmosDbQuery.kind = 'datasets';
            azureCosmosDbQuery.filters = [{property: 'property', operator: 'RegexMatch', value: {value: 'value'}}];
            AzureConfig.SIDECAR_ENABLE_QUERY = false;
            this.sandbox.stub(Items.prototype, 'query').returns(queryIterator);
            const res = await this.cosmos.runQuery(azureCosmosDbQuery as IJournalQueryModel);
            Tx.checkTrue(res[1].endCursor === 'continuationToken', done);
        });

        Tx.test( async(done: any) => {
            azureCosmosDbQuery.kind = 'datasets';
            azureCosmosDbQuery.filters = [{property: 'property', operator: 'CONTAINS', value: {value: 'value'}}];
            AzureConfig.SIDECAR_ENABLE_QUERY = false;
            azureCosmosDbQuery.pagingStart = '';
            azureCosmosDbQuery.pagingLimit = 0;
            this.sandbox.stub(Items.prototype, 'query').returns(queryIterator);
            const res = await this.cosmos.runQuery(azureCosmosDbQuery as IJournalQueryModel)
            Tx.checkTrue(res[1].endCursor === 'continuationToken', done);
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
            resources: ['resources'],
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

        const subfoldersQuery = 'SELECT SUBSTRING(c.data.path, LENGTH("' + datasetModel.path + '") - 1, ' +
            'INDEX_OF(c.data.path, "/", LENGTH("' + datasetModel.path + '")) - LENGTH("' + datasetModel.path + '") + 2) as path ' +
            'FROM c WHERE RegexMatch(c.id, "^(ds-' + datasetModel.tenant + '-' + datasetModel.subproject + '-)([a-z0-9]+)$") ' +
            'AND STARTSWITH(c.data.path, "' + datasetModel.path + '") ' +
            'AND c.data.path != "' + datasetModel.path + '" ' +
            'GROUP BY SUBSTRING(c.data.path, LENGTH("' + datasetModel.path + '") - 1, ' +
            'INDEX_OF(c.data.path, "/", LENGTH("' + datasetModel.path + '")) - LENGTH("' + datasetModel.path + '") + 2)';

        const distinctPathsQuery = 'SELECT DISTINCT VALUE c.data.path FROM c WHERE c.data.subproject = "'
            + datasetModel.subproject + '" AND STARTSWITH(c.data.path, "' + datasetModel.path + '", false)';

        Tx.test( async(done: any) => {
            AzureConfig.SIDECAR_ENABLE_QUERY = true;
            AzureConfig.ENABLE_OPTIMISED_QUERY = true;

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
                {endpoint: 'myendpoint', key: 'mykey'});

            const res = await this.cosmos.listFolders(datasetModel);

            const actualPaths = res[0].map(x => x['path']);

            this.sandbox.assert.calledOnceWithExactly(
                axiosInstancePostStub,
                AzureConfig.SIDECAR_URL + '/query',
                {
                    cs: 'AccountEndpoint=myendpoint;AccountKey=mykey;',
                    sql: distinctPathsQuery
                },
            );

            expect(actualPaths).to.have.same.members(expectedPaths);

            done();
        });

        Tx.test( async(done: any) => {
            AzureConfig.SIDECAR_ENABLE_QUERY = true;
            AzureConfig.ENABLE_OPTIMISED_QUERY = false;

            const axiosInstancePostStub = this.sandbox.stub(this.axiosInstance, 'post').resolves({
                data: {
                    records: [
                        {'path': 'a/'},
                        {'path': 'b/'},
                    ]
                }
            });

            const expectedPaths = [
                datasetModel.path + 'a/',
                datasetModel.path + 'b/',
            ]

            this.sandbox.stub(AzureDataEcosystemServices, 'getCosmosConnectionParams').resolves(
                {endpoint: 'myendpoint', key: 'mykey'});

            const res = await this.cosmos.listFolders(datasetModel);

            const actualPaths = res[0].map(x => x['path']);

            this.sandbox.assert.calledOnceWithExactly(
                axiosInstancePostStub,
                AzureConfig.SIDECAR_URL + '/query',
                {
                    cs: 'AccountEndpoint=myendpoint;AccountKey=mykey;',
                    sql: subfoldersQuery
                },
            );

            expect(actualPaths).to.have.same.members(expectedPaths);

            done();
        });

        Tx.test( async(done: any) => {
            AzureConfig.SIDECAR_ENABLE_QUERY = false;
            AzureConfig.ENABLE_OPTIMISED_QUERY = true;
            const itemsQueryStub = this.sandbox.stub(Items.prototype, 'query');
            itemsQueryStub.returns(queryIterator);
            const res = await this.cosmos.listFolders(datasetModel);
            this.sandbox.assert.calledOnceWithExactly(itemsQueryStub, distinctPathsQuery);
            done();
        });

        Tx.test( async(done: any) => {
            AzureConfig.SIDECAR_ENABLE_QUERY = false;
            AzureConfig.ENABLE_OPTIMISED_QUERY = false;
            const itemsQueryStub = this.sandbox.stub(Items.prototype, 'query');
            itemsQueryStub.returns(queryIterator);
            const res = await this.cosmos.listFolders(datasetModel);
            this.sandbox.assert.calledOnceWithExactly(itemsQueryStub, subfoldersQuery);
            done();
        });

    }

    private static listDatasets() {
        const datasetModel1: DatasetModel = this.getDatasetModel('dataset1.txt');
        const datasetModel2: DatasetModel = this.getDatasetModel('dataset2.txt');
        let tenant = 'tenant'
        let subproject = 'subproject'
        let path = 'path'
        let pagination = {
            limit: 1,
            cursor: "cursor"
        }
        Tx.sectionInit('listDatasets');
        let query =  'SELECT * FROM c WHERE c.data.subproject = "' + subproject +
            '" AND c.data.path = "' + path + '"'
        let queryIterator: QueryIterator<any> = this.getQueryIterator() as any;
        Tx.test( async(done: any) => {
            AzureConfig.SIDECAR_ENABLE_QUERY = false;
            let sinonStub = this.sandbox.stub(Items.prototype, 'query');
            sinonStub.returns(queryIterator);

            const dataset: DatasetModel = {} as DatasetModel;
            dataset.tenant = tenant;
            dataset.subproject = subproject;

            let res = await this.cosmos.listDatasets(dataset);
            let expectedQuery = 'SELECT * FROM c WHERE c.data.subproject = "' + dataset.subproject + '"';
            sinon.assert.calledWith(sinonStub, expectedQuery);
            done();
        });

        Tx.test( async(done: any) => {
            AzureConfig.SIDECAR_ENABLE_QUERY = false;
            let sinonStub = this.sandbox.stub(Items.prototype, 'query');
            sinonStub.returns(queryIterator);

            const dataset: DatasetModel = {} as DatasetModel;
            dataset.tenant = tenant;
            dataset.subproject = subproject;
            dataset.path = path;

            let res = await this.cosmos.listDatasets(dataset);
            sinon.assert.calledWith(sinonStub, query);
            done();
        });

        Tx.test( async(done: any) => {
            AzureConfig.SIDECAR_ENABLE_QUERY = false;
            let sinonStub = this.sandbox.stub(Items.prototype, 'query');
            sinonStub.returns(queryIterator);

            const dataset: DatasetModel = {} as DatasetModel;
            dataset.tenant = tenant;
            dataset.subproject = subproject;
            dataset.path = path;

            let res = await this.cosmos.listDatasets(dataset, pagination);
            sinon.assert.calledWith(sinonStub, query, {
                continuationToken: pagination.cursor,
                maxItemCount: pagination.limit
            });
            done();
        });

        Tx.test( async(done: any) => {
            AzureConfig.SIDECAR_ENABLE_QUERY = false;
            let sinonStub = this.sandbox.stub(Items.prototype, 'query');
            sinonStub.returns(queryIterator);

            const dataset: DatasetModel = {} as DatasetModel;
            dataset.tenant = tenant;
            dataset.subproject = subproject;
            dataset.path = path;
            dataset.gtags = ['gtag1'];
            const searchParam = 'name=file';
            const selectParams = ['name', 'subproject'];
            const expectedQuery = 'SELECT c.data.name, c.data.subproject FROM c WHERE c.data.subproject = "'
                + subproject + '" AND c.data.path = "' + path +
                '" AND (ARRAY_CONTAINS(c.data.gtags, \'gtag1\') OR c.data.gtags = \'gtag1\') AND c.data.name LIKE "file"';

            await this.cosmos.listDatasets(dataset, pagination, searchParam, selectParams);

            sinon.assert.calledWith(sinonStub, expectedQuery, {
                continuationToken: pagination.cursor,
                maxItemCount: pagination.limit
            });
            done();
        });

        Tx.test( async(done: any) => {
            AzureConfig.SIDECAR_ENABLE_QUERY = true;

            this.sandbox.stub(this.axiosInstance, 'post').resolves({
                data: {
                    records: [
                        {
                            data: datasetModel1
                        },
                        {
                            data: datasetModel2
                        }
                    ]
                }
            });

            const expectedDatasets = [
                datasetModel1,
                datasetModel2
            ]

            this.sandbox.stub(AzureDataEcosystemServices, 'getCosmosConnectionParams').resolves(
                {endpoint: 'myendpoint', key: 'mykey'});

            const dataset: DatasetModel = {} as DatasetModel;
            dataset.tenant = tenant;
            dataset.subproject = subproject;
            dataset.path = path;

            const results = await this.cosmos.listDatasets(dataset);

            this.sandbox.assert.calledWith(
                // @ts-ignore
                this.axiosInstance.post,
                AzureConfig.SIDECAR_URL + '/query',
                {
                    cs: 'AccountEndpoint=myendpoint;AccountKey=mykey;',
                    sql: query
                },
            );

            expect(results[0]).to.have.same.members(expectedDatasets);
            expect(results[1].endCursor).to.be.undefined

            done();
        });

        Tx.test(async (done: any) => {
            AzureConfig.SIDECAR_ENABLE_QUERY = true;

            this.sandbox.stub(this.axiosInstance, 'post').resolves({
                data: {
                    records: [
                        {
                            data: datasetModel1
                        },
                        {
                            data: datasetModel2
                        }
                    ],
                    continuationToken: "continuationToken"
                }
            });

            const expectedDatasets = [
                datasetModel1,
                datasetModel2
            ]

            this.sandbox.stub(AzureDataEcosystemServices, 'getCosmosConnectionParams').resolves(
                {endpoint: 'myendpoint', key: 'mykey'});

            const dataset: DatasetModel = {} as DatasetModel;
            dataset.tenant = tenant;
            dataset.subproject = subproject;
            dataset.path = path;

            const results = await this.cosmos.listDatasets(dataset, pagination);

            this.sandbox.assert.calledWith(
                // @ts-ignore
                this.axiosInstance.post,
                AzureConfig.SIDECAR_URL + '/query',
                {
                    cs: 'AccountEndpoint=myendpoint;AccountKey=mykey;',
                    sql: query,
                    ctoken: pagination.cursor,
                    limit: pagination.limit
                },
            );

            expect(results[0]).to.have.same.members(expectedDatasets);
            expect(results[1].endCursor).to.not.be.undefined

            done();
        });

        Tx.test(async (done: any) => {
            AzureConfig.SIDECAR_ENABLE_QUERY = true;

            this.sandbox.stub(this.axiosInstance, 'post').resolves({
                data: {
                    records: [
                        {
                            data: datasetModel1
                        },
                        {
                            data: datasetModel2
                        }
                    ],
                    continuationToken: "continuationToken"
                }
            });

            this.sandbox.stub(AzureDataEcosystemServices, 'getCosmosConnectionParams').resolves(
                {endpoint: 'myendpoint', key: 'mykey'});

            const dataset: DatasetModel = {} as DatasetModel;
            dataset.tenant = tenant;
            dataset.subproject = subproject;
            dataset.path = path;
            dataset.gtags = ['gtag1'];
            const searchParam = 'name=file';
            const selectParams = ['name', 'subproject'];
            const expectedQuery = 'SELECT c.data.name, c.data.subproject FROM c WHERE c.data.subproject = "'
                + subproject + '" AND c.data.path = "' + path +
                '" AND (ARRAY_CONTAINS(c.data.gtags, \'gtag1\') OR c.data.gtags = \'gtag1\') AND c.data.name LIKE "file"';


            await this.cosmos.listDatasets(dataset, pagination, searchParam, selectParams);

            this.sandbox.assert.calledWith(
                // @ts-ignore
                this.axiosInstance.post,
                AzureConfig.SIDECAR_URL + '/query',
                {
                    cs: 'AccountEndpoint=myendpoint;AccountKey=mykey;',
                    sql: expectedQuery,
                    ctoken: pagination.cursor,
                    limit: pagination.limit
                },
            );

            done();
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

      Tx.test(async (done: any) => {
          const dataset = {
              subproject: subproject,
              name: name,
          } as DatasetModel;
          AzureConfig.SIDECAR_ENABLE_QUERY = false;

          try {
              await this.cosmos.getSize(dataset);
          } catch (error) {
              expect(error.error.message).to.equal("[seismic-store-service] Path needs to be provided.");
              expect(error.error.status).to.equal("BAD_REQUEST");
              expect(error.error.code).to.equal(400);
          }
          done();
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
        let queryIterator: QueryIterator<any> = this.getQueryIterator(
          mockResult
        ) as any;

        Tx.test(async (done: any) => {
          AzureConfig.SIDECAR_ENABLE_QUERY = false;
          let sinonStub = this.sandbox.stub(Items.prototype, "query");

          sinonStub.returns(queryIterator);

          let res = await this.cosmos.getSize(dataset);
          expect(res).to.deep.equal({
            size_bytes: size_bytes,
            dataset_count: count,
          });

          sinon.assert.calledWith(sinonStub, expectedQuery);
          done();
        });
    }

    private static getDatasetModel(name: string) {
        return {
            name: name,
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
            acls: {admins: [], viewers: []},
            access_policy: ''
        };
    }

    private static createKey() {
        Tx.sectionInit('create key');

        Tx.test(async (done: any) => {
            const specs = {
                namespace: 'testNamespace',
                path: [AzureConfig.TENANTS_KIND, 'tnName']
            }

            const expectedKey = { partitionKey: 'tn-tnName', name: 'tnName' }

            const key = this.cosmos.createKey(specs);
            assert.deepEqual(key, expectedKey, 'Keys do not match');
            done();
        });

        Tx.test(async (done: any) => {
            const specs = {
                namespace: 'testNamespace',
                path: [AzureConfig.SUBPROJECTS_KIND, 'spName']
            }

            const expectedKey = { partitionKey: 'sp-spName', name: 'spName' }

            const key = this.cosmos.createKey(specs);
            assert.deepEqual(key, expectedKey, 'Keys do not match');
            done();
        });

        Tx.test(async (done: any) => {
            const specs = {
                namespace: Config.SEISMIC_STORE_NS + '-tenant-sp',
                path: [Config.DATASETS_KIND],
                enforcedKey: '/path/name'
            }
            const partitionKey = 'ds-tenant-sp-' + crypto.createHash('sha512').update('/path/name').digest('hex');
            const expectedKey = { partitionKey, name: 'name' }

            const key = this.cosmos.createKey(specs) as { name: string, partitionKey: string, kind: string };
            assert.deepEqual(key, expectedKey, 'Keys do not match');
            done();
        });

        Tx.test(async (done: any) => {
            const specs = {
                namespace: 'testNamespace',
                path: [AzureConfig.APPS_KIND, 'apName']
            }

            const expectedKey = { partitionKey: 'ap-apName', name: 'apName' }

            const key = this.cosmos.createKey(specs);
            assert.deepEqual(key, expectedKey, 'Keys do not match');
            done();
        });
    }

    private static getTransaction() {
        Tx.sectionInit('getTransaction');

        Tx.test( (done: any) => {
            const res = this.cosmos.getTransaction();
            Tx.checkTrue(res !== undefined, done);
        });

    }

    private static getQueryFilterSymbolContains() {
        Tx.sectionInit('getQueryFilterSymbolContains');

        Tx.test( (done: any) => {
            const res = this.cosmos.getQueryFilterSymbolContains();
            Tx.checkTrue(res === 'CONTAINS', done);
        });

    }

    private static queryFilter() {
        Tx.sectionInit('filter');

        Tx.test((done: any) => {
            const res = this.query.filter('property');
            Tx.checkTrue(res === this.query , done);

        });

        Tx.test( (done: any) => {
            const res = this.query.filter('property', undefined, undefined);
            Tx.checkTrue(res === this.query , done);

        });

        Tx.test( (done: any) => {
            const res = this.query.filter('', undefined, undefined);
            Tx.checkTrue(res === this.query , done);

        });

        Tx.test( (done: any) => {
            const res = this.query.filter('property', '=', {});
            Tx.checkTrue(res === this.query , done);

        });
    }


    private static queryStart() {
        Tx.sectionInit('Start');

        Tx.test( (done: any) => {
            const res = this.query.start('start');
            Tx.checkTrue(res === this.query , done);

        });

        Tx.test( (done: any) => {
            const start = {} as Buffer;
            const res = this.query.start(start);
            Tx.checkTrue(res === this.query , done);

        });
    }


    private static queryLimit() {
        Tx.sectionInit('Limit');

        Tx.test( (done: any) => {
            const res = this.query.limit(1);
            Tx.checkTrue(res === this.query , done);

        });
    }

    private static querygroupBy() {
        Tx.sectionInit('groupBy');

        Tx.test( (done: any) => {
            const res = this.query.groupBy('fieldName');
            Tx.checkTrue(res === this.query , done);

        });

        Tx.test( (done: any) => {
            const res = this.query.groupBy([]);
            Tx.checkTrue(res === this.query , done);

        });
    }

    private static querySelect() {
        Tx.sectionInit('Select');

        Tx.test( (done: any) => {
            const res = this.query.select('fieldName');
            Tx.checkTrue(res === this.query , done);

        });

        Tx.test( (done: any) => {
            const res = this.query.select([]);
            Tx.checkTrue(res === this.query , done);

        });
    }

    private static getQueryIterator(resources = ['resources']) {
        let feedResponse: FeedResponse<any> = {
            resources: resources,
            headers: undefined,
            hasMoreResults: false,
            continuation: '',
            continuationToken: 'continuationToken',
            queryMetrics: '',
            requestCharge: 0,
            activityId: ''
        } as any;
        return {
            clientContext: undefined,
            query: undefined,
            options: undefined,
            fetchFunctions: undefined,
            fetchAllTempResources: undefined,
            fetchAllLastResHeaders: undefined,
            queryExecutionContext: undefined,
            queryPlanPromise: undefined,
            isInitialized: undefined,
            getAsyncIterator: function (): AsyncIterable<FeedResponse<any>> {
                throw new Error('Function not implemented.');
            },
            hasMoreResults: function (): boolean {
                throw new Error('Function not implemented.');
            },
            fetchAll: function (): Promise<FeedResponse<any>> {
                return Promise.resolve(feedResponse);
            },
            fetchNext: function (): Promise<FeedResponse<any>> {
                return Promise.resolve(feedResponse);
            },
            reset: function (): void {
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
        };
    }

}
