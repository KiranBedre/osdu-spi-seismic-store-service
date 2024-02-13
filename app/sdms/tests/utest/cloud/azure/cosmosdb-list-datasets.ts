// ============================================================================
// Copyright 2023, Microsoft
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

import { Container, Items, QueryIterator } from '@azure/cosmos';
import { AzureCosmosDbDAO, AzureConfig, AzureDataEcosystemServices } from '../../../../src/cloud/providers/azure';
import { DatasetModel, ListDatasetsParams, AndQueryFilter, MatchQueryFilter,
    NotQueryFilter, OrQueryFilter
} from '../../../../src/services/dataset';
import { Config } from '../../../../src/cloud';
import { CosmosDbTestHelper } from './cosmosdb-test-helper';
import { Tx } from '../../utils';
import { assert, expect } from 'chai';
import { AxiosInstance } from 'axios';


export class TestAzureCosmosDbListDatasets {
    private static sandbox: sinon.SinonSandbox;
    private static axiosInstance: AxiosInstance;
    private static tmpAxios: AxiosInstance;
    private static cosmos: AzureCosmosDbDAO;

    public static run() {

        describe(Tx.testInit('azure cosmos db listDatasets test'), () => {
            this.sandbox = sinon.createSandbox();
            this.axiosInstance = {post () { return; }} as unknown as  AxiosInstance;
            this.cosmos = new AzureCosmosDbDAO({ gcpid: 'gcpid', default_acls: 'x', esd: 'gcpid@domain.com', name: 'gcpid' });

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

        this.listDatasets();
        this.listDatasetsQuery();
        });
    }

    private static listDatasets() {
        const datasetModel1: DatasetModel =  this.getDatasetModel('dataset1.txt');
        const datasetModel2: DatasetModel = this.getDatasetModel('dataset2.txt');
        let tenant = 'tenant'
        let subproject = 'subproject'
        let path = 'path'
        let pagination = {
            limit: 1,
            cursor: "cursor"
        }

        Tx.sectionInit('listDatasets');
        const paramNamePattern = '@parameter[A-Za-z0-9]{4}';
        const expectedQueryRegExp = new RegExp(`SELECT \\* FROM c WHERE \\(c.data.subproject = ${paramNamePattern}\\) AND \\(c.data.path = ${paramNamePattern}\\)`);

        let queryIterator: QueryIterator<any> = CosmosDbTestHelper.getQueryIterator() as any;

        Tx.test(async () => {
            this.sandbox.define(AzureConfig, 'SIDECAR_ENABLE_QUERY', false);
            let sinonStub = this.sandbox.stub(Items.prototype, 'query');
            sinonStub.returns(queryIterator);

            const dataset: DatasetModel = {} as DatasetModel;
            dataset.tenant = tenant;
            dataset.subproject = subproject;

            await this.cosmos.listDatasets({ dataset });
            let expectedQueryRegExp = new RegExp(`SELECT \\* FROM c WHERE c.data.subproject = ${paramNamePattern}`);
            sinon.assert.calledWith(sinonStub, sinon.match((querySpec) => {
                return querySpec.parameters.length === 1 &&
                    querySpec.parameters[0].name.startsWith('@parameter') &&
                    querySpec.parameters[0].value === dataset.subproject &&
                    expectedQueryRegExp.test(querySpec.query);
            }));

        });

        Tx.test(async () => {
            this.sandbox.define(AzureConfig, 'SIDECAR_ENABLE_QUERY', false);
            let sinonStub = this.sandbox.stub(Items.prototype, 'query');
            sinonStub.returns(queryIterator);

            const dataset: DatasetModel = {} as DatasetModel;
            dataset.tenant = tenant;
            dataset.subproject = subproject;
            dataset.path = path;

            await this.cosmos.listDatasets({ dataset });
            sinon.assert.calledWith(sinonStub, sinon.match((querySpec) => {
                return querySpec.parameters.length === 2 &&
                    querySpec.parameters[0].name.startsWith('@parameter') &&
                    querySpec.parameters[0].value === dataset.subproject &&
                    querySpec.parameters[1].name.startsWith('@parameter') &&
                    querySpec.parameters[1].value === dataset.path &&
                    expectedQueryRegExp.test(querySpec.query);
            }));

        });

        Tx.test(async () => {
            this.sandbox.define(AzureConfig, 'SIDECAR_ENABLE_QUERY', false);
            let sinonStub = this.sandbox.stub(Items.prototype, 'query');
            sinonStub.returns(queryIterator);

            const dataset: DatasetModel = {} as DatasetModel;
            dataset.tenant = tenant;
            dataset.subproject = subproject;
            dataset.path = path;

            await this.cosmos.listDatasets({ dataset, pagination });

            sinon.assert.calledWith(sinonStub, sinon.match((querySpec) => {
                return querySpec.parameters.length === 2 &&
                    querySpec.parameters[0].value === dataset.subproject &&
                    querySpec.parameters[1].value === dataset.path &&
                    querySpec.continuationToken === pagination.cursor &&
                    querySpec.maxItemCount === pagination.limit &&
                    expectedQueryRegExp.test(querySpec.query);
            }));


        });

        Tx.test(async () => {
            this.sandbox.define(AzureConfig, 'SIDECAR_ENABLE_QUERY', false);
            let sinonStub = this.sandbox.stub(Items.prototype, 'query');
            sinonStub.returns(queryIterator);

            const dataset: DatasetModel = {} as DatasetModel;
            dataset.tenant = tenant;
            dataset.subproject = subproject;
            dataset.path = path;
            dataset.gtags = ['gtag1'];
            const searchParam = 'name=file';
            const selectParams = ['name', 'subproject'];
            const expectedQueryRegExp = new RegExp(`SELECT c.data.name, c.data.subproject FROM c WHERE \\(\\(\\(c.data.subproject = ${paramNamePattern}\\) AND \\(c.data.path = ${paramNamePattern}\\)\\) AND \\(\\(EXISTS \\(SELECT VALUE 1 FROM t IN c.data.gtags WHERE t = ${paramNamePattern}\\) OR \\(IS_STRING\\(c.data.gtags\\) AND STRINGEQUALS\\(c.data.gtags, ${paramNamePattern}\\)\\)\\)\\)\\) AND \\(c.data.name LIKE ${paramNamePattern}\\)`);
            const listParams: ListDatasetsParams = {
                dataset,
                pagination,
                searchParam,
                selectParam: selectParams
            };
            await this.cosmos.listDatasets(listParams);

            sinon.assert.calledWith(sinonStub, sinon.match((querySpec) => {
                return querySpec.parameters.length === 4 &&
                    querySpec.parameters[0].value === dataset.subproject &&
                    querySpec.parameters[1].value === dataset.path &&
                    querySpec.parameters[2].value === dataset.gtags[0] &&
                    querySpec.parameters[3].value === searchParam.split('=')[1] &&
                    querySpec.continuationToken === pagination.cursor &&
                    querySpec.maxItemCount === pagination.limit &&
                    expectedQueryRegExp.test(querySpec.query);
            }));
        });

        Tx.test(async () => {
            this.sandbox.define(AzureConfig, 'SIDECAR_ENABLE_QUERY', false);
            let sinonStub = this.sandbox.stub(Items.prototype, 'query');
            sinonStub.returns(queryIterator);

            const dataset: DatasetModel = {} as DatasetModel;
            dataset.tenant = tenant;
            dataset.subproject = subproject;

            //check that the query for the following payload is correct
            // {
            //     "select": "[name, created_by]",
            //     "filter": {
            //         "and": [
            //             {
            //                 "not": {
            //                     "and": [
            //                         {
            //                             "property": "gtags",
            //                             "operator": "CONTAINS",
            //                             "value": "tagB"
            //                         },
            //                         {
            //                             "property": "name",
            //                             "operator": "CONTAINS",
            //                             "value": "randomfile.txt"
            //                         }
            //                     ]
            //                 }
            //             }
            //         ]
            //     }
            // }

            let tag = 'tagB';
            let fileName = 'randomfile.txt';
            const filter = new AndQueryFilter(new NotQueryFilter(new AndQueryFilter(
                new MatchQueryFilter('gtags', 'CONTAINS', tag),
                new MatchQueryFilter('name', 'CONTAINS', fileName)
            )));

            const selectParams = ['name', 'path'];
            const expectedQueryRegExp = new RegExp(
                `SELECT c.data.name, c.data.path FROM c WHERE \\(c.data.subproject = ${paramNamePattern}\\) AND \\(\\(NOT \\(\\(\\(EXISTS \\(SELECT VALUE 1 FROM t IN c.data.gtags WHERE t = ${paramNamePattern}\\) OR \\(IS_STRING\\(c.data.gtags\\) AND STRINGEQUALS\\(c.data.gtags, ${paramNamePattern}\\)\\)\\)\\) AND \\(\\(EXISTS \\(SELECT VALUE 1 FROM t IN c.data.name WHERE t = ${paramNamePattern}\\) OR \\(IS_STRING\\(c.data.name\\) AND STRINGEQUALS\\(c.data.name, ${paramNamePattern}\\)\\)\\)\\)\\)\\)\\)`
            );

            let searchParam;

            const listParams: ListDatasetsParams = {
                dataset,
                pagination,
                searchParam,
                selectParam: selectParams,
                filter: filter
            };
            await this.cosmos.listDatasets(listParams);

            sinon.assert.calledWith(sinonStub, sinon.match((querySpec) => {
                return querySpec.parameters.length === 3 &&
                    querySpec.parameters[0].value === dataset.subproject &&
                    querySpec.parameters[1].value === tag &&
                    querySpec.parameters[2].value === fileName &&
                    querySpec.continuationToken === pagination.cursor &&
                    querySpec.maxItemCount === pagination.limit &&
                    expectedQueryRegExp.test(querySpec.query);
            }));
        });

        Tx.test(async () => {
            this.sandbox.define(AzureConfig, 'SIDECAR_ENABLE_QUERY', false);
            let sinonStub = this.sandbox.stub(Items.prototype, 'query');
            sinonStub.returns(queryIterator);

            const dataset: DatasetModel = {} as DatasetModel;
            dataset.tenant = tenant;
            dataset.subproject = subproject;

            //check that the query for the following payload is correct
            // {
            //     "select": "[name,path]",
            //     "filter": {
            //         "or": [
            //             {
            //                 "property": "name",
            //                 "operator": "LIKE",
            //                 "value": "A%"
            //             },
            //             {
            //                 "property": "sbit_count",
            //                 "operator": "=",
            //                 "value": 0
            //             }
            //         ]
            //     }
            // }

            let value1 = 'A%';
            let value2 = 0;
            const filter = new OrQueryFilter(
                new MatchQueryFilter('name', 'LIKE', value1),
                new MatchQueryFilter('sbit_count', '=', value2)
            );
            const selectParams = ['name', 'path'];
            const expectedQueryRegExp = new RegExp(`SELECT c.data.name, c.data.path FROM c WHERE \\(c.data.subproject = ${paramNamePattern}\\) AND \\(\\(c.data.name LIKE ${paramNamePattern}\\) OR \\(c.data.sbit_count = ${paramNamePattern}\\)\\)`);
            let searchParam;
            const listParams: ListDatasetsParams = {
                dataset,
                pagination,
                searchParam,
                selectParam: selectParams,
                filter: filter
            };
            await this.cosmos.listDatasets(listParams);

            sinon.assert.calledWith(sinonStub, sinon.match((querySpec) => {
                return querySpec.parameters.length === 3 &&
                    querySpec.parameters[0].value === dataset.subproject &&
                    querySpec.parameters[1].value === value1 &&
                    querySpec.parameters[2].value === value2 &&
                    querySpec.continuationToken === pagination.cursor &&
                    querySpec.maxItemCount === pagination.limit &&
                    expectedQueryRegExp.test(querySpec.query);
            }));
        });

        Tx.test(async () => {
            this.sandbox.define(AzureConfig, 'SIDECAR_ENABLE_QUERY', false);
            let sinonStub = this.sandbox.stub(Items.prototype, 'query');
            sinonStub.returns(queryIterator);

            const dataset: DatasetModel = {} as DatasetModel;
            dataset.tenant = tenant;
            dataset.subproject = subproject;

            //check that the query for the following payload is correct
            // {
            //     "and": [
            //         {
            //             "or": [
            //                 {
            //                     "property": "name",
            //                     "operator": "LIKE",
            //                     "value": "W%"
            //                 },
            //                 {
            //                     "property": "name",
            //                     "operator": "LIKE",
            //                     "value": "R%"
            //                 }
            //             ]
            //         },
            //         {
            //             "not": {
            //                 "property": "name",
            //                 "operator": "LIKE",
            //                 "value": "WR%"
            //             }
            //         }
            //     ]
            // }

            let value1 = 'W%';
            let value2 = 'R%';
            let value3 = 'WR%';
            const filter = new AndQueryFilter(
                new OrQueryFilter(
                    new MatchQueryFilter('name', 'LIKE', value1),
                    new MatchQueryFilter('name', 'LIKE', value2)
                ),
                new NotQueryFilter(
                    new MatchQueryFilter('name', 'LIKE', value3)
                )
            );

            const selectParams = ['name', 'path'];
            const expectedQueryRegExp = new RegExp(`SELECT c.data.name, c.data.path FROM c WHERE \\(c.data.subproject = ${paramNamePattern}\\) AND \\(\\(\\(c.data.name LIKE ${paramNamePattern}\\) OR \\(c.data.name LIKE ${paramNamePattern}\\)\\) AND \\(NOT \\(c.data.name LIKE ${paramNamePattern}\\)\\)\\)`);
            let searchParam;

            const listParams: ListDatasetsParams = {
                dataset,
                pagination,
                searchParam,
                selectParam: selectParams,
                filter: filter
            };
            await this.cosmos.listDatasets(listParams);

            sinon.assert.calledWith(sinonStub, sinon.match((querySpec) => {
                return querySpec.parameters.length === 4 &&
                    querySpec.parameters[0].value === dataset.subproject &&
                    querySpec.parameters[1].value === value1 &&
                    querySpec.parameters[2].value === value2 &&
                    querySpec.parameters[3].value === value3 &&
                    querySpec.continuationToken === pagination.cursor &&
                    querySpec.maxItemCount === pagination.limit &&
                    expectedQueryRegExp.test(querySpec.query);
            }));
        });

        Tx.test(async () => {
            this.sandbox.define(AzureConfig, 'SIDECAR_ENABLE_QUERY', false);
            let sinonStub = this.sandbox.stub(Items.prototype, 'query');
            sinonStub.returns(queryIterator);

            const dataset: DatasetModel = {} as DatasetModel;
            dataset.tenant = tenant;
            dataset.subproject = subproject;

            //check that the query for the following payload is correct
            // {
            //     "or": [
            //         {
            //             "and": [
            //                 {
            //                     "property": "name",
            //                     "operator": "LIKE",
            //                     "value": "W%"
            //                 },
            //                 {
            //                     "property": "readonly",
            //                     "operator": "=",
            //                     "value": "false"
            //                 },
            //                 {
            //                     "not": {
            //                         "property": "gtags",
            //                         "operator": "CONTAINS",
            //                         "value": "tagA"
            //                     }
            //                 }
            //             ]
            //         },
            //         {
            //             "and": [
            //                 {
            //                     "or": [
            //                         {
            //                             "property": "name",
            //                             "operator": "LIKE",
            //                             "value": "R%"
            //                         },
            //                         {
            //                             "property": "name",
            //                             "operator": "LIKE",
            //                             "value": "A%"
            //                         }
            //                     ]
            //                 },
            //                 {
            //                     "property": "readonly",
            //                     "operator": "=",
            //                     "value": "true"
            //                 }
            //             ]
            //         }
            //     ]
            // }

            let value1 = 'W%';
            let value2 = 'false';
            let value3 = 'tagA';
            let value4 = 'R%';
            let value5 = 'A%';
            let value6 = true;
            const filter = new OrQueryFilter(
                new AndQueryFilter(
                    new MatchQueryFilter('name', 'LIKE', value1),
                    new MatchQueryFilter('readonly', '=', value2),
                    new NotQueryFilter(
                        new MatchQueryFilter('gtags', 'CONTAINS', value3)
                    )
                ),
                new AndQueryFilter(
                    new OrQueryFilter(
                        new MatchQueryFilter('name', 'LIKE', value4),
                        new MatchQueryFilter('name', 'LIKE', value5)
                    ),
                    new MatchQueryFilter('readonly', '=', value6)
                )
            );
            
            const selectParams = ['name', 'path'];
            const expectedQueryRegExp = new RegExp(`SELECT c.data.name, c.data.path FROM c WHERE \\(c.data.subproject = ${paramNamePattern}\\) AND \\(\\(\\(c.data.name LIKE ${paramNamePattern}\\) AND \\(c.data.readonly = ${paramNamePattern}\\) AND \\(NOT \\(\\(EXISTS \\(SELECT VALUE 1 FROM t IN c.data.gtags WHERE t = ${paramNamePattern}\\) OR \\(IS_STRING\\(c.data.gtags\\) AND STRINGEQUALS\\(c.data.gtags, ${paramNamePattern}\\)\\)\\)\\)\\)\\) OR \\(\\(\\(c.data.name LIKE ${paramNamePattern}\\) OR \\(c.data.name LIKE ${paramNamePattern}\\)\\) AND \\(c.data.readonly = ${paramNamePattern}\\)\\)\\)`);
            let searchParam;
            const listParams: ListDatasetsParams = {
                dataset,
                pagination,
                searchParam,
                selectParam: selectParams,
                filter: filter
            };
            await this.cosmos.listDatasets(listParams);

            sinon.assert.calledWith(sinonStub, sinon.match((querySpec) => {
                return querySpec.parameters.length === 7 &&
                    querySpec.parameters[0].value === dataset.subproject &&
                    querySpec.parameters[1].value === value1 &&
                    querySpec.parameters[2].value === value2 &&
                    querySpec.parameters[3].value === value3 &&
                    querySpec.parameters[4].value === value4 &&
                    querySpec.parameters[5].value === value5 &&
                    querySpec.parameters[6].value === value6 &&
                    querySpec.continuationToken === pagination.cursor &&
                    querySpec.maxItemCount === pagination.limit &&
                    expectedQueryRegExp.test(querySpec.query);
            }));
        });


        Tx.test(async () => {
            this.sandbox.define(AzureConfig, 'SIDECAR_ENABLE_QUERY', true);

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
                { endpoint: 'myendpoint', key: 'mykey' });

            const dataset: DatasetModel = {} as DatasetModel;
            dataset.tenant = tenant;
            dataset.subproject = subproject;
            dataset.path = path;

            const results = await this.cosmos.listDatasets({ dataset });
            
            this.sandbox.assert.calledWith(
                // @ts-ignore
                this.axiosInstance.post,
                sinon.match(AzureConfig.SIDECAR_URL + '/query'),
                {
                    cs: 'AccountEndpoint=myendpoint;AccountKey=mykey;',
                    sql: sinon.match(expectedQueryRegExp),
                    parameters: sinon.match.any,
                    corrid: undefined
                });

            expect(results[0]).to.have.same.members(expectedDatasets);
            expect(results[1].endCursor).to.be.undefined
        });

        Tx.test(async () => {
            this.sandbox.define(AzureConfig, 'SIDECAR_ENABLE_QUERY', true);

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
                { endpoint: 'myendpoint', key: 'mykey' });

            const dataset: DatasetModel = {} as DatasetModel;
            dataset.tenant = tenant;
            dataset.subproject = subproject;
            dataset.path = path;

            const results = await this.cosmos.listDatasets({ dataset, pagination });

            this.sandbox.assert.calledWith(
                // @ts-ignore
                this.axiosInstance.post,
                sinon.match(AzureConfig.SIDECAR_URL + '/query'),
                {
                    cs: 'AccountEndpoint=myendpoint;AccountKey=mykey;',
                    sql: sinon.match(expectedQueryRegExp),
                    parameters: sinon.match.any,
                    corrid: undefined,
                    ctoken: pagination.cursor,
                    limit: pagination.limit
                });

            expect(results[0]).to.have.same.members(expectedDatasets);
            expect(results[1].endCursor).to.not.be.undefined
        });

        Tx.test(async () => {
            this.sandbox.define(AzureConfig, 'SIDECAR_ENABLE_QUERY', true);

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
                { endpoint: 'myendpoint', key: 'mykey' });

            const dataset: DatasetModel = {} as DatasetModel;
            dataset.tenant = tenant;
            dataset.subproject = subproject;
            dataset.path = path;
            dataset.gtags = ['gtag1'];
            const searchParam = 'name=file';
            const selectParams = ['name', 'subproject'];
            // const expectedQuery = 'SELECT c.data.name, c.data.subproject FROM c WHERE (((c.data.subproject = "'
            //     + subproject + '") AND (c.data.path = "' + path +
            //     '")) AND ((EXISTS (SELECT VALUE 1 FROM t IN c.data.gtags WHERE t = \'gtag1\') OR (IS_STRING(c.data.gtags) AND STRINGEQUALS(c.data.gtags, \'gtag1\'))))) AND (c.data.name LIKE "file")';
            const expectedQueryRegExp = new RegExp(`SELECT c.data.name, c.data.subproject FROM c WHERE \\(\\(\\(c.data.subproject = ${paramNamePattern}\\) AND \\(c.data.path = ${paramNamePattern}\\)\\) AND \\(\\(EXISTS \\(SELECT VALUE 1 FROM t IN c.data.gtags WHERE t = ${paramNamePattern}\\) OR \\(IS_STRING\\(c.data.gtags\\) AND STRINGEQUALS\\(c.data.gtags, ${paramNamePattern}\\)\\)\\)\\)\\) AND \\(c.data.name LIKE ${paramNamePattern}\\)`);

            const listParams: ListDatasetsParams = {
                dataset,
                pagination,
                searchParam,
                selectParam: selectParams
            };
            await this.cosmos.listDatasets(listParams);

            this.sandbox.assert.calledWith(
                // @ts-ignore
                this.axiosInstance.post,
                sinon.match(AzureConfig.SIDECAR_URL + '/query'),
                {
                    cs: 'AccountEndpoint=myendpoint;AccountKey=mykey;',
                    sql: sinon.match(expectedQueryRegExp),
                    parameters: sinon.match.any,
                    corrid: undefined,
                    ctoken: pagination.cursor,
                    limit: pagination.limit
                });
        });
    }

    private static listDatasetsQuery() {

        Tx.sectionInit('listDatasetsQuery');
        const paramNamePattern = '@parameter[A-Za-z0-9]{4}';

        Tx.test(() => {
            const model = this.getDatasetModel();
            const dataset = model as DatasetModel;
            dataset.gtags = [];
            dataset.path = '';

            let [query, parameters] = this.cosmos.listDatasetsQuery({ dataset });
            let expectedQueryRegExp = new RegExp(`SELECT \\* FROM c WHERE c.data.subproject = ${paramNamePattern}`);
            assert(expectedQueryRegExp.test(query), 'listDatasetsQuery returned wrong query ' + query);
            assert(parameters.length === 1, 'listDatasetsQuery returned wrong parameters ' + parameters);
            assert(parameters[0].name.startsWith('@parameter'), 'listDatasetsQuery returned wrong parameter names ' + parameters[0].name);
            assert(parameters[0].value === dataset.subproject, 'listDatasetsQuery returned wrong parameter values ' + parameters[0].value);

        });

        Tx.test(() => {
            const model = this.getDatasetModel();
            const dataset = model as DatasetModel;
            dataset.gtags = [];

            let [query, parameters] = this.cosmos.listDatasetsQuery({ dataset });
            let expectedQueryRegExp = new RegExp(`SELECT \\* FROM c WHERE \\(c.data.subproject = ${paramNamePattern}\\) AND \\(c.data.path = ${paramNamePattern}\\)`);
            assert(expectedQueryRegExp.test(query), 'listDatasetsQuery returned wrong query ' + query);
            assert(parameters.length === 2, 'listDatasetsQuery returned wrong parameters ' + parameters);
            assert(parameters[0].name.startsWith('@parameter'), 'listDatasetsQuery returned wrong parameter names ' + parameters[0]);
            assert(parameters[0].value === dataset.subproject, 'listDatasetsQuery returned wrong parameter values ' + parameters[0]);
            assert(parameters[1].name.startsWith('@parameter'), 'listDatasetsQuery returned wrong parameter names ' + parameters[1]);
            assert(parameters[1].value === dataset.path, 'listDatasetsQuery returned wrong parameter values ' + parameters[1]);
        });

        Tx.test(() => {
            const model = this.getDatasetModel();
            const dataset = model as DatasetModel;
            dataset.gtags = [];

            let [query, parameters] = this.cosmos.listDatasetsQuery({ dataset, searchParam: 'field=value', selectParam: ['id', 'name'] });
            let expectedQueryRegExp = new RegExp(`SELECT c.id, c.data.name FROM c WHERE \\(\\(c.data.subproject = ${paramNamePattern}\\) AND \\(c.data.path = ${paramNamePattern}\\)\\) AND \\(c.data.field LIKE ${paramNamePattern}\\)`);
            assert(expectedQueryRegExp.test(query), 'listDatasetsQuery returned wrong query ' + query);
            assert(parameters.length === 3, 'listDatasetsQuery returned wrong parameters ' + parameters);
        });

        Tx.test(() => {
            const model = this.getDatasetModel();
            const dataset = model as DatasetModel;
            dataset.gtags = [];

            let [query, parameters] = this.cosmos.listDatasetsQuery({ dataset, selectParam: ['id', 'gcsurl'], recursive: true });
            let expectedQueryRegExp = new RegExp(`SELECT c.id, c.data.gcsurl FROM c WHERE \\(c.data.subproject = ${paramNamePattern}\\) AND \\(\\(STARTSWITH\\(c.data.path, ${paramNamePattern}, false\\)\\)\\)`);
            assert(expectedQueryRegExp.test(query), 'listDatasetsQuery returned wrong query ' + query);
            assert(parameters.length === 2, 'listDatasetsQuery returned wrong parameters ' + parameters);
        });

        Tx.test(() => {
            const model = this.getDatasetModel();
            const dataset = model as DatasetModel;
            dataset.gtags = [];

            let [query, parameters] =  this.cosmos.listDatasetsQuery({ dataset, filter: new MatchQueryFilter('property', 'RegexMatch', 'aRegex') });
            let expectedQueryRegExp = new RegExp(`SELECT \\* FROM c WHERE \\(\\(c.data.subproject = ${paramNamePattern}\\) AND \\(c.data.path = ${paramNamePattern}\\)\\) AND \\(\\(RegexMatch\\(c.data.property, ${paramNamePattern}\\)\\)\\)`);
            assert(expectedQueryRegExp.test(query), 'listDatasetsQuery returned wrong query ' + query);
            assert(parameters.length === 3, 'listDatasetsQuery returned wrong parameters ' + parameters);
        });
    }

    public static getDatasetModel(name?: string) {
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
            acls: { admins: [], viewers: [] },
            access_policy: ''
        };
    }
}
