// ============================================================================
// Copyright 2017-2023 Schlumberger
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

import { Datastore } from '@google-cloud/datastore';
import { Entity } from '@google-cloud/datastore/build/src/entity';
import { RunQueryResponse } from '@google-cloud/datastore/build/src/query';
import sinon from 'sinon';
import { Config } from '../../../src/cloud';
import { google } from '../../../src/cloud/providers';
import { DatasetModel } from '../../../src/services/dataset';
import { DatasetDAO } from '../../../src/services/dataset/dao';
import { Locker } from '../../../src/services/dataset/locker';
import { IPaginationModel } from '../../../src/services/dataset/model';
import { Tx } from '../utils';


export class TestDataset {

	private static dataset: DatasetModel;
	private static journal: any;
	private static testDb: Datastore;
	private static sandbox: sinon.SinonSandbox;

	public static run() {
		TestDataset.dataset = {
			name: 'ds01',
			path: 'path',
			subproject: 'subproject',
			tenant: 'tenant',
		} as DatasetModel;

		TestDataset.testDb = new Datastore({
			projectId: 'GoogleProjectID',
		});

		describe(Tx.testInit('seismic store dao dataset test'), () => {
			beforeEach(() => {
				this.sandbox = sinon.createSandbox();

				this.journal = this.sandbox.createStubInstance(google.DatastoreDAO);
				this.journal.createKey.callsFake((specs) => TestDataset.testDb.key(specs));
				this.journal.createQuery.callsFake((namespace, kind) =>
					TestDataset.testDb.createQuery(namespace, kind)
				);
				this.journal.KEY = Datastore.KEY;
				Config.CLOUDPROVIDER = 'google';
			});

			afterEach(() => {
				this.sandbox.restore();
			});

			TestDataset.testRegister();
			TestDataset.testGet();
			TestDataset.testUpdate();
			TestDataset.testList();
			TestDataset.testDelete();
			TestDataset.testDeleteAll();
			TestDataset.testPaginatedListContent();
			TestDataset.testFixOldModel();
			TestDataset.testListContent();
		});
	}

	private static testRegister() {
		Tx.sectionInit('register');

		Tx.test(async (done: any) => {
			this.journal.save.resolves({} as never);
			await DatasetDAO.register(this.journal, { key: { 'key': 'dataset_key' }, data: TestDataset.dataset });
			done();
		});

		Tx.test(async (done: any) => {
			this.journal.save.resolves();
			await DatasetDAO.register(this.journal, { key: { 'key': 'dataset_key' }, data: TestDataset.dataset });
			done();
		});
	}

	private static testGet() {
		Tx.sectionInit('get');

		Tx.test(async (done: any) => {
			this.journal.runQuery.resolves([[], undefined]);

			const results = await DatasetDAO.get(this.journal, this.dataset);

			Tx.checkTrue(results[0] === undefined && results[1] === undefined, done);
		});

		Tx.test(async (done: any) => {
			const entity: Entity = {
				ctag: '123',
				name: 'ds01',
				subproject: 'subproject',
				tenant: 'tenant',
			};
			entity[Datastore.KEY] = this.journal.createKey({
				namespace: 'seismic-store-ns',
				path: ['datasets', '123'],
			});
			const queryResponse: RunQueryResponse = [[entity], undefined];
			this.journal.runQuery.resolves(queryResponse);
			this.sandbox.stub(DatasetDAO, 'fixOldModel').resolves(entity);

			const result = await DatasetDAO.get(this.journal, this.dataset);

			Tx.checkTrue(result[0] === entity, done);
		});

		Tx.test(async (done: any) => {
			const entity: Entity = {};
			entity[Datastore.KEY] = this.journal.createKey({
				namespace: 'seismic-store-ns',
				path: ['datasets', '123'],
			});
			const queryResponse: RunQueryResponse = [[entity], undefined];
			this.journal.runQuery.resolves(queryResponse);
			this.sandbox.stub(DatasetDAO, 'fixOldModel').resolves(entity);

			const result = await DatasetDAO.get(this.journal, this.dataset);
			Tx.checkTrue(result[0][Datastore.KEY].name === '123', done);
		});
	}

	private static testUpdate() {
		Tx.sectionInit('update');

		Tx.test(async (done: any) => {
			this.journal.save.resolves();
			await DatasetDAO.update(
				this.journal,
				this.dataset,
				this.journal.createKey({ namespace: 'datasets', path: '324' })
			);
			done();
		});
	}

	private static testList1() {
		Tx.sectionInit('list ');

		Tx.test(async (done: any) => {
			const expectedResult = [
				{
					created_by: 'user@email',
					created_date: 'Wed Oct 09 2019 16:50:07 GMT+0000 (UTC)',
					ctag: 'ctag',
					filemetadata: {
						nobjects: 1,
						size: 7768,
						type: 'GENERIC',
					},
					gcsurl: 'gcsurl',
					last_modified_date: 'Wed Oct 09 2019 16:50:10 GMT+0000 (UTC)',
					ltag: 'ltag',
					name: 'ds01',
					path: '/',
					sbit: null,
					sbit_count: 0,
					subproject: 'subproject',
					tenant: 'tenant',
				} as DatasetModel,
			];
			const query = this.journal.createQuery(
				Config.SEISMIC_STORE_NS + '-' + this.dataset.tenant + '-' + this.dataset.subproject,
				Config.DATASETS_KIND
			);

			this.journal.runQuery.resolves([expectedResult, undefined]);
			this.sandbox.stub(DatasetDAO, 'fixOldModel').resolves(expectedResult[0]);

			const result = await DatasetDAO.list(this.journal, this.dataset, null, null, null);

			Tx.checkTrue(
				this.journal.runQuery.calledWith(query) && result[0] === expectedResult[0],
				done
			);
		});

		Tx.test(async (done: any) => {
			this.dataset.gtags = ['tagA', 'tagB'];
			const expectedResult = [
				{
					// tslint:disable-next-line: object-literal-sort-keys
					created_by: 'user@email',
					created_date: 'Wed Oct 09 2019 16:50:07 GMT+0000 (UTC)',
					ctag: 'ctag',
					filemetadata: {
						nobjects: 1,
						size: 7768,
						type: 'GENERIC',
					},
					gcsurl: 'gcsurl',
					gtags: ['tagA', 'tagB'],
					last_modified_date: 'Wed Oct 09 2019 16:50:10 GMT+0000 (UTC)',
					ltag: 'ltag',
					name: 'ds01',
					path: '/',
					sbit: null,
					sbit_count: 0,
					subproject: 'subproject',
					tenant: 'tenant',
				} as DatasetModel,
			];

			let query = this.journal.createQuery(
				Config.SEISMIC_STORE_NS + '-' + this.dataset.tenant + '-' + this.dataset.subproject,
				Config.DATASETS_KIND
			);
			for (const gtag of ['tagA', 'tagB']) {
				query = query.filter('gtags', 'CONTAINS', gtag);
			}

			this.journal.runQuery.resolves([expectedResult, undefined]);
			this.sandbox.stub(DatasetDAO, 'fixOldModel').resolves(expectedResult[0]);

			const result = await DatasetDAO.list(this.journal, this.dataset, null, null, null);

			Tx.checkTrue(
				this.journal.runQuery.calledWith(query) && result[0] === expectedResult[0],
				done
			);
		});
	}

	private static testList() {
		Tx.sectionInit('list ');

		Tx.test(async (done: any) => {
			const expectedResult = [
				{
					created_by: 'user@email',
					created_date: 'Wed Oct 09 2019 16:50:07 GMT+0000 (UTC)',
					ctag: 'ctag',
					filemetadata: {
						nobjects: 1,
						size: 7768,
						type: 'GENERIC',
					},
					gcsurl: 'gcsurl',
					last_modified_date: 'Wed Oct 09 2019 16:50:10 GMT+0000 (UTC)',
					ltag: 'ltag',
					name: 'ds01',
					path: '/',
					sbit: null,
					sbit_count: 0,
					subproject: 'subproject',
					tenant: 'tenant',
				} as DatasetModel,
			];
			const query = this.journal.createQuery(
				Config.SEISMIC_STORE_NS + '-' + this.dataset.tenant + '-' + this.dataset.subproject,
				Config.DATASETS_KIND
			);

			this.journal.runQuery.resolves([expectedResult, undefined]);
			this.journal.getQueryFilterSymbolContains.returns('=');
			this.sandbox.stub(DatasetDAO, 'fixOldModel').resolves(expectedResult[0]);

			await DatasetDAO.list(this.journal, this.dataset, null, null, null);
			done()
		});

		Tx.test(async (done: any) => {
			this.dataset.gtags = ['tagA', 'tagB'];
			const expectedResult = [
				{
					// tslint:disable-next-line: object-literal-sort-keys
					created_by: 'user@email',
					created_date: 'Wed Oct 09 2019 16:50:07 GMT+0000 (UTC)',
					ctag: 'ctag',
					filemetadata: {
						nobjects: 1,
						size: 7768,
						type: 'GENERIC',
					},
					gcsurl: 'gcsurl',
					gtags: ['tagA', 'tagB'],
					last_modified_date: 'Wed Oct 09 2019 16:50:10 GMT+0000 (UTC)',
					ltag: 'ltag',
					name: 'ds01',
					path: '/',
					sbit: null,
					sbit_count: 0,
					subproject: 'subproject',
					tenant: 'tenant',
				} as DatasetModel,
			];

			let query = this.journal.createQuery(
				Config.SEISMIC_STORE_NS + '-' + this.dataset.tenant + '-' + this.dataset.subproject,
				Config.DATASETS_KIND
			);
			for (const gtag of ['tagA', 'tagB']) {
				query = query.filter('gtags', '=', gtag);
			}

			this.journal.runQuery.resolves([expectedResult, undefined]);
			this.journal.getQueryFilterSymbolContains.returns('=');
			this.sandbox.stub(DatasetDAO, 'fixOldModel').resolves(expectedResult[0]);

			await DatasetDAO.list(this.journal, this.dataset, null, null, null);
			done()
		});

		Tx.test(async (done: any) => {
			Config.CLOUDPROVIDER = 'azure';
			this.dataset.gtags = ['tagA', 'tagB'];
			const expectedResult = [
				{
					// tslint:disable-next-line: object-literal-sort-keys
					created_by: 'user@email',
					created_date: 'Wed Oct 09 2019 16:50:07 GMT+0000 (UTC)',
					ctag: 'ctag',
					filemetadata: {
						nobjects: 1,
						size: 7768,
						type: 'GENERIC',
					},
					gcsurl: 'gcsurl',
					gtags: ['tagA', 'tagB'],
					last_modified_date: 'Wed Oct 09 2019 16:50:10 GMT+0000 (UTC)',
					ltag: 'ltag',
					name: 'ds01',
					path: '/',
					sbit: null,
					sbit_count: 0,
					subproject: 'subproject',
					tenant: 'tenant',
				} as DatasetModel,
			];

			let query = this.journal.createQuery(
				Config.SEISMIC_STORE_NS + '-' + this.dataset.tenant + '-' + this.dataset.subproject,
				Config.DATASETS_KIND
			);
			for (const gtag of ['tagA', 'tagB']) {
				query = query.filter('gtags', 'CONTAINS', gtag);
			}

			this.journal.runQuery.resolves([expectedResult, undefined]);
			this.journal.getQueryFilterSymbolContains.returns('CONTAINS');
			this.sandbox.stub(DatasetDAO, 'fixOldModel').resolves(expectedResult[0]);

			await DatasetDAO.list(this.journal, this.dataset, null, null, null);
			done()
		});

		Tx.test(async (done: any) => {
			Config.CLOUDPROVIDER = 'azure';
			this.dataset.gtags = ['tagA', 'tagB'];
			const expectedResult = [
				{
					// tslint:disable-next-line: object-literal-sort-keys
					created_by: 'user@email',
					created_date: 'Wed Oct 09 2019 16:50:07 GMT+0000 (UTC)',
					ctag: 'ctag',
					filemetadata: {
						nobjects: 1,
						size: 7768,
						type: 'GENERIC',
					},
					gcsurl: 'gcsurl',
					gtags: ['tagA', 'tagB'],
					last_modified_date: 'Wed Oct 09 2019 16:50:10 GMT+0000 (UTC)',
					ltag: 'ltag',
					name: 'ds01',
					path: '/',
					sbit: null,
					sbit_count: 0,
					subproject: 'subproject',
					tenant: 'tenant',
				} as DatasetModel,
			];

			let query = this.journal.createQuery(
				Config.SEISMIC_STORE_NS + '-' + this.dataset.tenant + '-' + this.dataset.subproject,
				Config.DATASETS_KIND
			);

			for (const gtag of ['tagA', 'tagB']) {
				query = query.filter('gtags', 'CONTAINS', gtag);
			}

			this.journal.runQuery.resolves([expectedResult, undefined]);
			this.journal.getQueryFilterSymbolContains.returns('CONTAINS');
			this.sandbox.stub(DatasetDAO, 'fixOldModel').resolves(expectedResult[0]);
			await DatasetDAO.list(this.journal, this.dataset, null, null, null);
			done()
		});
	}


	private static testDelete() {
		Tx.sectionInit('delete');

		Tx.test(async (done: any) => {
			const entity: Entity = {};
			entity[Datastore.KEY] = this.journal.createKey({
				namespace: 'seismic-store-ns',
				path: ['datasets', '123'],
			});
			this.journal.delete.resolves();

			await DatasetDAO.delete(this.journal, entity);

			Tx.checkTrue(this.journal.delete.calledWith(entity[Datastore.KEY]), done);
		});
	}

	private static testDeleteAll() {
		Tx.sectionInit('delete all');

		Tx.test(async (done: any) => {
			const entityOne: Entity = {};
			entityOne[Datastore.KEY] = this.journal.createKey({
				namespace: 'seismic-store-ns',
				path: ['datasets', '123'],
			});

			const entityTwo: Entity = {};
			entityTwo[Datastore.KEY] = this.journal.createKey({
				namespace: 'seismic-store-ns',
				path: ['datasets', '123'],
			});

			const query = this.journal.createQuery(
				Config.SEISMIC_STORE_NS + '-' + 'tenant' + '-' + 'subproject',
				Config.DATASETS_KIND
			);

			this.journal.runQuery.resolves([[entityOne, entityTwo], undefined]);

			this.journal.delete.resolves();

			await DatasetDAO.deleteAll(this.journal, 'tenant', 'subproject');

			Tx.checkTrue(
				this.journal.runQuery.calledWith(query) &&
				this.journal.delete.getCall(0).calledWith(entityOne[Datastore.KEY]) &&
				this.journal.delete.getCall(1).calledWith(entityTwo[Datastore.KEY]),
				done
			);
		});
	}

	private static testPaginatedListContent() {
		Tx.sectionInit('pagination');

		Tx.test(async (done: any) => {
			const pagination: IPaginationModel = {
				cursor: undefined,
				limit: 5,
			};

			this.journal.listFolders.resolves([[{path: '/a/b/c/'}], { endCursor: 'NO_MORE_RESULTS' }]);
			this.journal.runQuery.resolves([[{}], { endCursor: 'NO_MORE_RESULTS' }]);
			await DatasetDAO.paginatedListContent(this.journal, this.dataset, Config.LS_MODE.ALL, pagination);
			done()
		});

		Tx.test(async (done: any) => {
			const pagination: IPaginationModel = {
				cursor: 'cursor',
				limit: 5,
			};

			const entityOne: Entity = { name: 'dataset01' };
			entityOne[Datastore.KEY] = this.journal.createKey({
				namespace: 'seismic-store-ns',
				path: ['datasets', '123'],
			});

			let query = this.journal
				.createQuery(
					Config.SEISMIC_STORE_NS + '-' + this.dataset.tenant + '-' + this.dataset.subproject,
					Config.DATASETS_KIND
				)
				.filter('path', this.dataset.path);

			query = query.start('cursor').limit(pagination.limit);

			this.journal.runQuery.resolves([[entityOne], { endCursor: 'MORE_RESULTS' }]);

			await DatasetDAO.paginatedListContent(this.journal, this.dataset, Config.LS_MODE.ALL, pagination);

			Tx.checkTrue(this.journal.runQuery.calledWith(query), done);
		});
	}

	private static testFixOldModel() {
		Tx.sectionInit('fix old model');
		Tx.testExp(async (done: any) => {
			this.sandbox.stub(Locker, 'getLock').resolves('WriteLockValue');
			const result = await DatasetDAO.fixOldModel(this.dataset, 'tenant-a', 'subproject-a');
			Tx.checkTrue(result.sbit === 'WriteLockValue' && result.sbit_count === 1, done);
		});

		Tx.testExp(async (done: any) => {
			this.sandbox.stub(Locker, 'getLock').resolves(['RAxBxCx', 'RDxExFx']);
			const result = await DatasetDAO.fixOldModel(this.dataset, 'tenant-a', 'subproject-a');
			Tx.checkTrue(result.sbit === 'RAxBxCx,RDxExFx' && result.sbit_count === 2, done);
		});

		Tx.testExp(async (done: any) => {
			this.sandbox.stub(Locker, 'getLock').resolves(undefined);
			const result = await DatasetDAO.fixOldModel(this.dataset, 'tenant-a', 'subproject-a');
			Tx.checkTrue(result.sbit === null && result.sbit_count === 0, done);
		});

		Tx.testExp(async (done: any) => {
			this.sandbox.stub(Locker, 'getLock').resolves(undefined);
			const dataset = { name: 'dataset-a' } as DatasetModel;
			const result = await DatasetDAO.fixOldModel(dataset, 'tenant-a', 'subproject-a');

			const validationResult =
				result.sbit === null &&
				result.sbit_count === 0 &&
				result.tenant === 'tenant-a' &&
				result.subproject === 'subproject-a' &&
				result.ctag === '0000000000000000';
			Tx.checkTrue(validationResult === true, done);
		});
	}

	private static testListContent() {
		Tx.sectionInit('test list content');

		Tx.testExp(async (done: any) => {

			const dataset = {
				name: 'dataset01',
				path: '/',
				tenant: 'tenant-a',
				subproject: 'subproject-a'
			} as DatasetModel;
			const entityOne: Entity = { name: 'dataset01', path: '/', tenant: 'tenant-a', subproject: 'subproject-a' };
			entityOne[Datastore.KEY] = this.journal.createKey({
				namespace: 'seismic-store-ns',
				path: ['/', '123'],
			});
			const entityTwo: Entity = { name: 'dataset02', path: '/a/b/c', tenant: 'tenant-a', subproject: 'subproject-a' };
			entityOne[Datastore.KEY] = this.journal.createKey({
				namespace: 'seismic-store-ns',
				path: ['/a/b/c', '123'],
			});
			const entityThree: Entity = { name: 'dataset03', path: '/a/b/c', tenant: 'tenant-a', subproject: 'subproject-a' };
			entityOne[Datastore.KEY] = this.journal.createKey({
				namespace: 'seismic-store-ns',
				path: ['/a/b/c', '123'],
			});

			const entityFour: Entity = { name: 'dataset04', path: '/d/e/f', tenant: 'tenant-a', subproject: 'subproject-a' };
			entityOne[Datastore.KEY] = this.journal.createKey({
				namespace: 'seismic-store-ns',
				path: ['/d/e/f', '123'],
			});

			// stub results for dataset (with path "/");
			this.journal.runQuery.resolves([[entityOne]]);

			// stub results for all directories under the path "/"
			this.journal.listFolders.resolves([[entityTwo, entityThree, entityFour]]);

			const result = await DatasetDAO.listContent(this.journal, dataset, Config.LS_MODE.ALL);

			Tx.checkTrue(
				JSON.stringify(result.datasets) === JSON.stringify(
					['dataset01']) && JSON.stringify(result.directories) === JSON.stringify(['a/', 'd/']), done);

		});
	}
}
