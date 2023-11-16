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
            let backup: string;

        beforeEach(() => {
            backup = Config.CLOUDPROVIDER;
            Config.CLOUDPROVIDER = 'azure';
            this.sandbox.stub(AzureCosmosDbDAO.prototype, 'getCosmoContainer').resolves(
                new Container(undefined, 'id', undefined));
            // replace axiosInstance to our stub. Unfortunately, we can't do this with sandbox methods.
            this.tmpAxios = AzureCosmosDbDAO.axiosInstance;
            AzureCosmosDbDAO.axiosInstance = this.axiosInstance;
            this.sandbox.replace(AzureCosmosDbDAO, 'axiosInstance', this.axiosInstance);
        })

        afterEach(() => {
            AzureCosmosDbDAO.axiosInstance = this.tmpAxios;  // restore Axios instance
            Config.CLOUDPROVIDER = backup;
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
        let query = 'SELECT * FROM c WHERE (c.data.subproject = "' + subproject +
            '") AND (c.data.path = "' + path + '")'
        let queryIterator: QueryIterator<any> = CosmosDbTestHelper.getQueryIterator() as any;

        Tx.test(async () => {
            AzureConfig.SIDECAR_ENABLE_QUERY = false;
            let sinonStub = this.sandbox.stub(Items.prototype, 'query');
            sinonStub.returns(queryIterator);

            const dataset: DatasetModel = {} as DatasetModel;
            dataset.tenant = tenant;
            dataset.subproject = subproject;

            let res = await this.cosmos.listDatasets({ dataset });
            let expectedQuery = 'SELECT * FROM c WHERE c.data.subproject = "' + dataset.subproject + '"';
            sinon.assert.calledWith(sinonStub, expectedQuery);
        });

        Tx.test(async () => {
            AzureConfig.SIDECAR_ENABLE_QUERY = false;
            let sinonStub = this.sandbox.stub(Items.prototype, 'query');
            sinonStub.returns(queryIterator);

            const dataset: DatasetModel = {} as DatasetModel;
            dataset.tenant = tenant;
            dataset.subproject = subproject;
            dataset.path = path;

            let res = await this.cosmos.listDatasets({ dataset });
            sinon.assert.calledWith(sinonStub, query);

        });

        Tx.test(async () => {
            AzureConfig.SIDECAR_ENABLE_QUERY = false;
            let sinonStub = this.sandbox.stub(Items.prototype, 'query');
            sinonStub.returns(queryIterator);

            const dataset: DatasetModel = {} as DatasetModel;
            dataset.tenant = tenant;
            dataset.subproject = subproject;
            dataset.path = path;

            let res = await this.cosmos.listDatasets({ dataset, pagination });
            sinon.assert.calledWith(sinonStub, query, {
                continuationToken: pagination.cursor,
                maxItemCount: pagination.limit
            });

        });

        Tx.test(async () => {
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
            const expectedQuery = 'SELECT c.data.name, c.data.subproject FROM c WHERE (((c.data.subproject = "'
                + subproject + '") AND (c.data.path = "' + path +
                '")) AND ((EXISTS (SELECT VALUE 1 FROM t IN c.data.gtags WHERE t = \'gtag1\') OR (IS_STRING(c.data.gtags) AND STRINGEQUALS(c.data.gtags, \'gtag1\'))))) AND (c.data.name LIKE "file")';

            const listParams: ListDatasetsParams = {
                dataset,
                pagination,
                searchParam,
                selectParam: selectParams
            };
            await this.cosmos.listDatasets(listParams);

            sinon.assert.calledWith(sinonStub, expectedQuery, {
                continuationToken: pagination.cursor,
                maxItemCount: pagination.limit
            });
        });

        Tx.test(async () => {
            AzureConfig.SIDECAR_ENABLE_QUERY = false;
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
                new MatchQueryFilter('gtags', 'CONTAINS', tag, 'STRING'),
                new MatchQueryFilter('name', 'CONTAINS', fileName, 'STRING')
            )));


            const selectParams = ['name', 'path'];
            const expectedQuery = 'SELECT c.data.name, c.data.path FROM c WHERE (c.data.subproject = "' +
                subproject + '") AND ((NOT (((EXISTS (SELECT VALUE 1 FROM t IN c.data.gtags WHERE t = \'' +
                tag + '\') OR (IS_STRING(c.data.gtags) AND STRINGEQUALS(c.data.gtags, \'' + tag + '\')))) AND ' +
                '((EXISTS (SELECT VALUE 1 FROM t IN c.data.name WHERE t = \'' + fileName + '\') ' +
                'OR (IS_STRING(c.data.name) AND STRINGEQUALS(c.data.name, \'' + fileName + '\')))))))';

            let searchParam;

            const listParams: ListDatasetsParams = {
                dataset,
                pagination,
                searchParam,
                selectParam: selectParams,
                filter: filter
            };
            await this.cosmos.listDatasets(listParams);

            sinon.assert.calledWith(sinonStub, expectedQuery, {
                continuationToken: pagination.cursor,
                maxItemCount: pagination.limit
            });
        });

        Tx.test(async () => {
            AzureConfig.SIDECAR_ENABLE_QUERY = false;
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
                new MatchQueryFilter('name', 'LIKE', value1, 'STRING'),
                new MatchQueryFilter('sbit_count', '=', value2, 'NUMBER')
            );


            const selectParams = ['name', 'path'];
            const expectedQuery = 'SELECT c.data.name, c.data.path FROM c WHERE (c.data.subproject = "' + subproject +
                '") AND ((c.data.name LIKE "' + value1 + '") OR (c.data.sbit_count = ' + value2 + '))';

            let searchParam;

            const listParams: ListDatasetsParams = {
                dataset,
                pagination,
                searchParam,
                selectParam: selectParams,
                filter: filter
            };
            await this.cosmos.listDatasets(listParams);

            sinon.assert.calledWith(sinonStub, expectedQuery, {
                continuationToken: pagination.cursor,
                maxItemCount: pagination.limit
            });
        });

        Tx.test(async () => {
            AzureConfig.SIDECAR_ENABLE_QUERY = false;
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
                    new MatchQueryFilter('name', 'LIKE', value1, 'STRING'),
                    new MatchQueryFilter('name', 'LIKE', value2, 'STRING')
                ),
                new NotQueryFilter(
                    new MatchQueryFilter('name', 'LIKE', value3, 'STRING')
                )
            );

            const selectParams = ['name', 'path'];

            const expectedQuery = 'SELECT c.data.name, c.data.path FROM c WHERE (c.data.subproject = "' + subproject +
                '") AND (((c.data.name LIKE "' + value1 + '") OR (c.data.name LIKE "' + value2 + '"))' +
                ' AND (NOT (c.data.name LIKE "' + value3 + '")))';

            let searchParam;

            const listParams: ListDatasetsParams = {
                dataset,
                pagination,
                searchParam,
                selectParam: selectParams,
                filter: filter
            };
            await this.cosmos.listDatasets(listParams);

            sinon.assert.calledWith(sinonStub, expectedQuery, {
                continuationToken: pagination.cursor,
                maxItemCount: pagination.limit
            });
        });

        Tx.test(async () => {
            AzureConfig.SIDECAR_ENABLE_QUERY = false;
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
            let value6 = 'true';
            const filter = new OrQueryFilter(
                new AndQueryFilter(
                    new MatchQueryFilter('name', 'LIKE', value1, 'STRING'),
                    new MatchQueryFilter('readonly', '=', value2, 'BOOLEAN'),
                    new NotQueryFilter(
                        new MatchQueryFilter('gtags', 'CONTAINS', value3, 'STRING')
                    )
                ),
                new AndQueryFilter(
                    new OrQueryFilter(
                        new MatchQueryFilter('name', 'LIKE', value4, 'STRING'),
                        new MatchQueryFilter('name', 'LIKE', value5, 'STRING')
                    ),
                    new MatchQueryFilter('readonly', '=', value6, 'BOOLEAN')
                )
            );
            
            const selectParams = ['name', 'path'];
            
            const expectedQuery = 'SELECT c.data.name, c.data.path FROM c WHERE (c.data.subproject = "' + subproject +
                '") AND (((c.data.name LIKE "' + value1 + '") AND (c.data.readonly = ' + value2 + ')' +
                ' AND (NOT ((EXISTS (SELECT VALUE 1 FROM t IN c.data.gtags WHERE t = \'' + value3 + '\')' +
                ' OR (IS_STRING(c.data.gtags) AND STRINGEQUALS(c.data.gtags, \'' + value3 + '\'))))))' +
                ' OR (((c.data.name LIKE "' + value4 + '") OR (c.data.name LIKE "' + value5 + '"))' +
                ' AND (c.data.readonly = ' + value6 + ')))';

            let searchParam;

            const listParams: ListDatasetsParams = {
                dataset,
                pagination,
                searchParam,
                selectParam: selectParams,
                filter: filter
            };
            await this.cosmos.listDatasets(listParams);

            sinon.assert.calledWith(sinonStub, expectedQuery, {
                continuationToken: pagination.cursor,
                maxItemCount: pagination.limit
            });
        });


        Tx.test(async () => {
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
                { endpoint: 'myendpoint', key: 'mykey' });

            const dataset: DatasetModel = {} as DatasetModel;
            dataset.tenant = tenant;
            dataset.subproject = subproject;
            dataset.path = path;

            const results = await this.cosmos.listDatasets({ dataset });

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
        });

        Tx.test(async () => {
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
                { endpoint: 'myendpoint', key: 'mykey' });

            const dataset: DatasetModel = {} as DatasetModel;
            dataset.tenant = tenant;
            dataset.subproject = subproject;
            dataset.path = path;

            const results = await this.cosmos.listDatasets({ dataset, pagination });

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
        });

        Tx.test(async () => {
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
                { endpoint: 'myendpoint', key: 'mykey' });

            const dataset: DatasetModel = {} as DatasetModel;
            dataset.tenant = tenant;
            dataset.subproject = subproject;
            dataset.path = path;
            dataset.gtags = ['gtag1'];
            const searchParam = 'name=file';
            const selectParams = ['name', 'subproject'];
            const expectedQuery = 'SELECT c.data.name, c.data.subproject FROM c WHERE (((c.data.subproject = "'
                + subproject + '") AND (c.data.path = "' + path +
                '")) AND ((EXISTS (SELECT VALUE 1 FROM t IN c.data.gtags WHERE t = \'gtag1\') OR (IS_STRING(c.data.gtags) AND STRINGEQUALS(c.data.gtags, \'gtag1\'))))) AND (c.data.name LIKE "file")';

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
                AzureConfig.SIDECAR_URL + '/query',
                {
                    cs: 'AccountEndpoint=myendpoint;AccountKey=mykey;',
                    sql: expectedQuery,
                    ctoken: pagination.cursor,
                    limit: pagination.limit
                },
            );
        });
    }

    private static listDatasetsQuery() {

        Tx.sectionInit('listDatasetsQuery');

        Tx.test(() => {
            let dataset: DatasetModel = this.getDatasetModel('dataset1.txt');
            dataset.gtags = [];
            dataset.path = '';

            let res = this.cosmos.listDatasetsQuery({ dataset });
            let expectedQuery = `SELECT * FROM c WHERE c.data.subproject = "${dataset.subproject}"`;
            assert(res === expectedQuery, 'listDatasetsQuery returned wrong query ' + res);
        });

        Tx.test(() => {
            let dataset: DatasetModel = this.getDatasetModel('dataset1.txt');
            dataset.gtags = [];

            let res = this.cosmos.listDatasetsQuery({ dataset });
            let expectedQuery = `SELECT * FROM c WHERE (c.data.subproject = "${dataset.subproject}") AND (c.data.path = "${dataset.path}")`;
            assert(res === expectedQuery, 'listDatasetsQuery returned wrong query ' + res);
        });

        Tx.test(() => {
            const dataset: DatasetModel = this.getDatasetModel('dataset1.txt');
            dataset.gtags = [];

            let res = this.cosmos.listDatasetsQuery({ dataset, searchParam: 'field=value', selectParam: ['id', 'name'] });
            let expectedQuery = `SELECT c.id, c.data.name FROM c WHERE ((c.data.subproject = "${dataset.subproject}") AND (c.data.path = "${dataset.path}")) AND (c.data.field LIKE "value")`;
            assert(res === expectedQuery, 'listDatasetsQuery returned wrong query ' + res);
        });

        Tx.test(() => {
            const dataset: DatasetModel = this.getDatasetModel('dataset1.txt');
            dataset.gtags = [];

            let res = this.cosmos.listDatasetsQuery({ dataset, selectParam: ['id', 'gcsurl'], recursive: true });
            let expectedQuery = `SELECT c.id, c.data.gcsurl FROM c WHERE (c.data.subproject = "${dataset.subproject}") AND ((STARTSWITH(c.data.path, \'${dataset.path}\', false)))`;
            assert(res === expectedQuery, 'listDatasetsQuery returned wrong query ' + res);
        });

        Tx.test(() => {
            const dataset: DatasetModel = this.getDatasetModel('dataset1.txt');
            dataset.gtags = [];

            let res = this.cosmos.listDatasetsQuery({ dataset, filter: new MatchQueryFilter('property', 'RegexMatch', 'aRegex', 'STRING') });
            let expectedQuery = `SELECT * FROM c WHERE ((c.data.subproject = "${dataset.subproject}") AND (c.data.path = "${dataset.path}")) AND ((RegexMatch(c.data.property, 'aRegex')))`;
            assert(res === expectedQuery, 'listDatasetsQuery returned wrong query ' + res);
        });
    }

    public static getDatasetModel(name: string) {
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