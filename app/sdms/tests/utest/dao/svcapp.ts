// ============================================================================
// Copyright 2017-2019, Schlumberger
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

import { Datastore } from '@google-cloud/datastore';
import { JournalFactoryTenantClient } from '../../../src/cloud';
import { google } from '../../../src/cloud/providers';
import { Config } from '../../../src/cloud';
import { DatasetModel } from '../../../src/services/dataset';
import { AppsDAO } from '../../../src/services/svcapp/dao';
import { IAppModel } from '../../../src/services/svcapp/model';
import { TenantModel } from '../../../src/services/tenant';
import { Tx } from '../utils';

export class TestSvcApp {
	private static dataset: DatasetModel;
	private static journal: any;
	private static testDb: Datastore;
	private static sandbox: sinon.SinonSandbox;

	public static run() {
		this.dataset = {
			name: 'ds01',
			path: 'path',
			subproject: 'subproject',
			tenant: 'tenant',
		} as DatasetModel;

		this.testDb = new Datastore({
			projectId: 'GoogleCloudProject',
		});

		describe(Tx.testInit('seismic store svcapp dao test'), () => {
			beforeEach(() => {
				this.sandbox = sinon.createSandbox();

				this.journal = this.sandbox.createStubInstance(google.DatastoreDAO);
				this.journal.createKey.callsFake((specs) => TestSvcApp.testDb.key(specs));
				this.journal.runQuery.callsFake((query) => TestSvcApp.testDb.runQuery(query));
				this.journal.createQuery.callsFake((namespace, kind) =>
					TestSvcApp.testDb.createQuery(namespace, kind)
				);
				this.journal.KEY = Datastore.KEY;

				this.sandbox.define(Config, 'CLOUDPROVIDER', 'google');
			});

			afterEach(() => {
				this.sandbox.restore();
			});

			afterEach(() => {
				this.sandbox.restore();
			});

			TestSvcApp.testRegister();
			TestSvcApp.testGet();
			TestSvcApp.testList();
		});
	}

	private static testRegister() {
		Tx.sectionInit('register app');
		const tenant = { name: 'tenant', esd: 'esd', gcpid: 'google_project' } as TenantModel;
		const application = { email: 'email', trusted: true } as IAppModel;

		Tx.test(async () => {
			this.sandbox.stub(JournalFactoryTenantClient, 'get').returns(this.journal);
			this.journal.save.resolves({} as never);
			await AppsDAO.register(tenant, application);
		});
	}

	private static testGet() {
		Tx.sectionInit('get');
		const tenant = { name: 'tenant', esd: 'esd', gcpid: 'google_project' } as TenantModel;

		Tx.test(async () => {
			this.sandbox.stub(JournalFactoryTenantClient, 'get').returns(this.journal);
			this.journal.get.resolves({ email: 'app@email', trusted: true });
			await AppsDAO.get(tenant, 'app@email');
		});
	}

	private static testList() {
		Tx.sectionInit('list');
		const tenant = { name: 'tenant', esd: 'esd', gcpid: 'google_project' } as TenantModel;

		Tx.test(async () => {
			this.sandbox.stub(JournalFactoryTenantClient, 'get').returns(this.journal);

			const returnValue = [
				{ email: 'app01@email', trusted: true },
				{ email: 'app02@email', trusted: false },
			];
			this.journal.runQuery.resolves([returnValue]);
			this.sandbox.stub(Array.prototype, 'map').returns(returnValue);
			await AppsDAO.list(tenant);
		});
	}
}
