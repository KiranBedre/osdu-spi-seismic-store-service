// ============================================================================
// Copyright 2017-2024, Schlumberger
//
// Licensed under the Apache License, Version 2.0 (the 'License');
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an 'AS IS' BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
// ============================================================================

import { Datastore } from '@google-cloud/datastore';
import { Request as expRequest, Response as expResponse } from 'express';
import { Auth, AuthGroups } from '../../../src/auth';
import { Config, google, StorageFactory } from '../../../src/cloud';
import { ISeistore, SeistoreFactory } from '../../../src/cloud/seistore';
import { IStorage } from '../../../src/cloud/storage';
import { DatasetDAO } from '../../../src/services/dataset';
import { SubProjectDAO, SubprojectGroups, SubProjectModel } from '../../../src/services/subproject';
import { SubProjectHandler } from '../../../src/services/subproject/handler';
import { SubProjectOP } from '../../../src/services/subproject/optype';
import { TenantAuth, TenantDAO, TenantModel } from '../../../src/services/tenant';
import { Response } from '../../../src/shared';
import { Tx } from '../utils';

import sinon from 'sinon';

export class TestSubProjectSVC {

    public static run() {
        this.testSubProject = {
            name: 'test-subproject',
            admin: 'test-admin@domain.com',
            tenant: 'test-tenant',
            storage_class: 'geo-location',
            acls: {
                admins: ['admin-a@domain.com'],
                viewers: ['vieweres-b@domain.com']
            },
            ltag: 'legalTag'
        } as SubProjectModel;

        this.mockSeistore = {
            checkExtraSubprojectCreateParams(requestBody: any, subproject: SubProjectModel): void {
                return;
            },
            async getEmailFromTokenPayload(userCredentials: string, internalSwapForSauth: boolean): Promise<string> {
                return;
            },
            async notifySubprojectCreationStatus(subproject: SubProjectModel, status: string): Promise<string> {
                return 'messageID';
            },
            async getDatasetStorageResource(tenant: TenantModel, subproject: SubProjectModel): Promise<string> {
                return 'storageBucket';
            },
            async getSubprojectStorageResources(tenant: TenantModel, subproject: SubProjectModel): Promise<void> {
                return;
            },
            async deleteStorageResources(tenant: TenantModel, subproject: SubProjectModel): Promise<void> {
                return;
            },
            async handleReadinessCheck(): Promise<boolean> {
                return true;
            },
            validateAccessPolicy(subproject: SubProjectModel, accessPolicy: string): void {
                return;
            }
        };

        TestSubProjectSVC.testDb = new Datastore({ projectId: 'GoogleProjectID' });

        describe(Tx.testInit('subproject'), () => {

            beforeEach(() => {
                this.sandbox = sinon.createSandbox();
                this.journal = this.sandbox.createStubInstance(google.DatastoreDAO);
                this.journal.createQuery.callsFake(
                    (namespace, kind) => TestSubProjectSVC.testDb.createQuery(namespace, kind));
                this.journal.createKey.callsFake((specs) => TestSubProjectSVC.testDb.key(specs));
                this.journal.KEY = Datastore.KEY;
                this.sandbox.stub(Response, 'writeMetric').returns();
                // set CLOUD PROVIDER so that GCS class is loaded
                this.sandbox.define(Config, 'CLOUDPROVIDER', 'google');
            });
            afterEach(() => { this.sandbox.restore(); });

            this.create();
            this.get();
            this.list();
            this.others();
            this.delete();

        });

    }

    private static sandbox: sinon.SinonSandbox;

    private static journal: any;
    private static testDb: Datastore;
    private static testSubProject: SubProjectModel;
    private static mockSeistore: ISeistore;

    private static create() {

        Tx.sectionInit('create');

        Tx.testExpAsync(async (expReq: expRequest, expRes: expResponse) => {

            expReq.body.admin = 'user@user.com';
            expReq.body.storage_class = 'REGIONAL';
            expReq.body.storage_location = 'US-CENTRAL1';
            expReq.headers.ltag = 'ltag';
            this.sandbox.stub(TenantDAO, 'get').resolves({} as any);
            this.sandbox.stub(TenantAuth, 'getAuthGroups').returns([]);
            this.sandbox.stub(Auth, 'isUserAuthorized').resolves();
            this.sandbox.stub(Auth, 'isLegalTagValid').resolves();
            this.sandbox.stub(SubProjectDAO, 'exist').resolves(false);
            this.sandbox.stub(google.GCS.prototype, 'createBucket').resolves();
            this.sandbox.stub(SubProjectDAO, 'register').resolves();
            this.sandbox.stub(AuthGroups, 'createGroup').resolves();
            this.sandbox.stub(AuthGroups, 'listUsersInGroup').rejects({ error: { code: 404, status: 'NOT_FOUND' } });
            this.sandbox.stub(AuthGroups, 'addUserToGroup').resolves();
            this.sandbox.stub(google.GCS.prototype, 'bucketExists').resolves(false);
            this.sandbox.stub(Auth, 'isImpersonationToken').returns(false);
            this.sandbox.stub(SeistoreFactory, 'build').returns(this.mockSeistore);
            await SubProjectHandler.handler(expReq, expRes, SubProjectOP.Create);
            Tx.check200(expRes.statusCode);
        });

        Tx.testExpAsync(async (expReq: expRequest, expRes: expResponse) => {
            expReq.body.admin = 'user@user.com';
            expReq.body.storage_class = 'REGIONAL';
            expReq.body.storage_location = 'US-CENTRAL1';
            expReq.headers.ltag = 'ltag';
            this.sandbox.stub(TenantDAO, 'get').resolves({} as any);
            this.sandbox.stub(Auth, 'isUserAuthorized');
            this.sandbox.stub(Auth, 'isLegalTagValid');
            this.sandbox.stub(SubProjectDAO, 'exist').resolves({} as any);
            this.sandbox.stub(Response, 'writeError');
            this.sandbox.stub(SeistoreFactory, 'build').returns(this.mockSeistore);
            await SubProjectHandler.handler(expReq, expRes, SubProjectOP.Create);
        });

        Tx.test(async () => {
            this.journal.save.resolves();
            const subproject = { tenant: 'tnx', name: 'spx' } as SubProjectModel;
            await SubProjectDAO.register(this.journal, subproject);
        });

    }

    private static get() {

        Tx.sectionInit('get');

        Tx.testExpAsync(async (expReq: expRequest, expRes: expResponse) => {
            this.sandbox.stub(TenantDAO, 'get').resolves({} as any);
            this.sandbox.stub(Auth, 'isUserAuthorized');
            this.sandbox.stub(SubProjectDAO, 'get').resolves(this.testSubProject);
            this.sandbox.stub(Auth, 'isLegalTagValid');
            this.sandbox.stub(Auth, 'isImpersonationToken').returns(false);
            await SubProjectHandler.handler(expReq, expRes, SubProjectOP.Get);
            Tx.check200(expRes.statusCode);
        });

        Tx.testExpAsync(async (expReq: expRequest, expRes: expResponse) => {
            this.sandbox.stub(TenantDAO, 'get').resolves({} as any);
            this.sandbox.stub(Auth, 'isUserAuthorized');
            this.sandbox.stub(Auth, 'isLegalTagValid');
            this.sandbox.stub(SubProjectDAO, 'get').resolves(this.testSubProject);
            this.sandbox.stub(Auth, 'isImpersonationToken').returns(false);
            await SubProjectHandler.handler(expReq, expRes, SubProjectOP.Get);
            Tx.check200(expRes.statusCode);
        });

    }

    private static list() {

        Tx.sectionInit('list');

        Tx.testExpAsync(async (expReq: expRequest, expRes: expResponse) => {
            this.sandbox.stub(TenantDAO, 'get').resolves({} as any);
            this.sandbox.stub(TenantAuth, 'getAuthGroups').returns([]);
            this.sandbox.stub(Auth, 'isUserAuthorized');
            this.sandbox.stub(SubProjectDAO, 'list').resolves([{ ltag: 'ltag' }, {}] as any);
            this.sandbox.stub(Auth, 'isLegalTagValid');
            this.sandbox.stub(Auth, 'isImpersonationToken').returns(false);
            this.sandbox.stub(SubProjectDAO, 'get').resolves();
            await SubProjectHandler.handler(expReq, expRes, SubProjectOP.List);
            Tx.check200(expRes.statusCode);
        });

        Tx.testExpAsync(async (expReq: expRequest, expRes: expResponse) => {
            this.sandbox.stub(TenantDAO, 'get').resolves({} as any);
            this.sandbox.stub(TenantAuth, 'getAuthGroups').returns([]);
            this.sandbox.stub(Auth, 'isUserAuthorized');
            this.sandbox.stub(SubProjectDAO, 'list').resolves([{ ltag: 'ltag' }, {}] as any);
            this.sandbox.stub(Auth, 'isLegalTagValid').resolves({} as any);
            this.sandbox.stub(Auth, 'isImpersonationToken').returns(false);
            this.sandbox.stub(SubProjectDAO, 'get').resolves();
            await SubProjectHandler.handler(expReq, expRes, SubProjectOP.List);
            Tx.check200(expRes.statusCode);
        });

        Tx.test(async () => {
            this.journal.runQuery.resolves([[]] as never);
            this.sandbox.stub(SubProjectDAO, 'constructServiceGroupACLs').resolves({
                'admins': ['admin@xyz.com'],
                'viewers': ['viewer@xyz.com']
            });
            await SubProjectDAO.list(this.journal, 'tnx');
        });

        Tx.test(async () => {
            const entityID = []; entityID[this.journal.KEY] = { name: 'name' };
            this.sandbox.stub(SubProjectDAO, 'constructServiceGroupACLs').resolves({
                'admins': ['admin@xyz.com'],
                'viewers': ['viewer@xyz.com']
            });
            this.journal.runQuery.resolves([[entityID]] as never);
            await SubProjectDAO.list(this.journal, 'tnx');
        });

        Tx.test(async () => {
            const entityID = []; entityID[this.journal.KEY] = { name: 'name' };
            this.sandbox.stub(SubProjectDAO, 'constructServiceGroupACLs').resolves({
                'admins': ['admin@xyz.com'],
                'viewers': ['viewer@xyz.com']
            });
            this.journal.runQuery.resolves([[{ name: 'name', tenant: 'tenant' }]] as never);
            await SubProjectDAO.list(this.journal, 'tnx');
        });
    }

    private static others() {

        Tx.sectionInit('others');

        Tx.testExpAsync(async (expReq: expRequest, expRes: expResponse) => {
            this.sandbox.stub(Auth, 'isImpersonationToken').returns(true);
            this.sandbox.stub(Auth, 'isLegalTagValid');
            this.sandbox.stub(SeistoreFactory, 'build').returns(this.mockSeistore);
            await SubProjectHandler.handler(expReq, expRes, SubProjectOP.Create);
            Tx.check403(expRes.statusCode);
        });

        Tx.testExpAsync(async (expReq: expRequest, expRes: expResponse) => {
            this.sandbox.stub(TenantDAO, 'get').resolves({} as any);
            await SubProjectHandler.handler(expReq, expRes, undefined);
        });

    }
    private static delete() {

        Tx.sectionInit('delete');

        Tx.testExpAsync(async (expReq: expRequest, expRes: expResponse) => {
            this.sandbox.stub(TenantDAO, 'get').resolves({ name: 'tenant-a', gcpid: 'gcp-id' } as TenantModel);
            this.sandbox.stub(SubProjectDAO, 'get').resolves(this.testSubProject);
            this.sandbox.stub(SubProjectDAO, 'delete').resolves();
            this.sandbox.stub(DatasetDAO, 'deleteAll').resolves();
            this.sandbox.stub(TenantAuth, 'getAuthGroups').returns([]);
            this.sandbox.stub(Auth, 'isUserAuthorized').resolves();
            this.sandbox.stub(Auth, 'isImpersonationToken').returns(false);
            const storage: IStorage = {
                async deleteFiles() {
                    await new Promise(resolve => setTimeout(resolve, 1));
                },
                async deleteBucket() {
                    await new Promise(resolve => setTimeout(resolve, 1));
                },
                async createBucket() { return; },
                async bucketExists() { return false; },
                async deleteObjects() { return; },
                async saveObject() { return; },
                async copy() { return; },
                async randomBucketName() { return ''; },
                getStorageTiers() { return ['tier-a', 'tier-b', 'tier-c']; },
                async getObjectSize() { return 1; },
                async setStorageTiers() {return; },
                async getStorageAccountRedundancy() { return ''; },
                async checkSupportedTier() { return; },
                async listBlobs() { return ['']; },
                async listBlobsFilter() { return ['']; },
                async checkTier() { return ''; }
            };
            this.sandbox.stub(StorageFactory, 'build').returns(storage);
            this.sandbox.stub(SubprojectGroups, 'serviceAdminGroup').returns('adminGroup');
            this.sandbox.stub(SubprojectGroups, 'serviceEditorGroup').returns('editorGroup');
            this.sandbox.stub(SubprojectGroups, 'serviceViewerGroup').returns('viewerGroup');
            // this.sandbox.stub(AuthGroups, 'clearGroup').resolves();

            await SubProjectHandler.handler(expReq, expRes, SubProjectOP.Delete);
            Tx.check200(expRes.statusCode);
        });
    }

}
