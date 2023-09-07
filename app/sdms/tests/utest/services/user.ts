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

import { Request as expRequest, Response as expResponse } from 'express';
import sinon from 'sinon';
import { Auth, AuthGroups } from '../../../src/auth';
import { JournalFactoryTenantClient } from '../../../src/cloud';
import { Config } from '../../../src/cloud/config';
import { IDESEntitlementGroupModel } from '../../../src/cloud/dataecosystem';
import { google } from '../../../src/cloud/providers';
import { DatasetDAO, DatasetModel } from '../../../src/services/dataset';
import { SubProjectDAO, SubProjectModel, SubprojectAuth } from '../../../src/services/subproject';
import { TenantDAO } from '../../../src/services/tenant';
import { UserHandler } from '../../../src/services/user/handler';
import { UserOP } from '../../../src/services/user/optype';
import { UserParser } from '../../../src/services/user/parser';
import { Response, SDPathModel } from '../../../src/shared';
import { Tx } from '../utils';


export class TestUserSVC {

    public static run() {

        describe(Tx.testInit('user'), () => {

            beforeEach(() => {
                this.spy = sinon.createSandbox();
                this.spy.stub(Response, 'writeMetric').returns();
                this.subproject = {
                    name: 'subproject-test',
                    admin: 'admin@xyz.com',
                    acls: {
                        admins: [],
                        viewers: []
                    },
                    access_policy: 'uniform'
                } as SubProjectModel;

                this.userGroups = [
                    {
                        name: 'service.seistore.dev.tenant01.subproject01.admin',
                        description: 'seismic store tenant tenant01 subproject subproject01 admin group',
                        email: 'service.seistore.dev.tenant01.sproject01.admin@domain.com'
                    },
                    {
                        name: 'service.seistore.dev.tenant01.subproject01.editor',
                        description: 'seismic store tenant tenant01 subproject subproject01 editor group',
                        email: 'service.seistore.dev.tenant01.sproject01.editor@domain.com'
                    },
                    {
                        name: 'service.seistore.dev.tenant01.subproject01.viewer',
                        description: 'seismic store tenant tenant01 subproject subproject01 viewer group',
                        email: 'service.seistore.dev.tenant01.sproject01.viewer@domain.com'
                    },
                    {
                        name: 'data.sdms.tenant01.subproject02.db9621fd-64da-4d32-937a-d14f2bee519c.viewer',
                        description: 'seismic dms tenant tenant01 subproject subproject02 viewer group',
                        email: 'data.sdms.tenant01.sproject02.db9621fd-64da-4d32-937a-d14f2bee519c.viewer@domain.com'
                    },
                    {
                        name: 'data.sdms.tenant01.subproject02.be1221rt-564a-4d32-ty54-r37v2prt821r.admin',
                        description: 'seismic dms tenant tenant01 subproject subproject02 admin group',
                        email: 'data.sdms.tenant01.sproject02.be1221rt-564a-4d32-ty54-r37v2prt821r.admin@domain.com'
                    }

                ];

                this.subprojectList = [
                    {
                        'gcs_bucket': 'bucket',
                        'tenant': 'tenant01',
                        'storage_class': 'REGIONAL',
                        'storage_location': 'US-CENTRAL1',
                        'admin': 'person1@domain.com',
                        'name': 'person',
                        'acls': {
                            'admins': [
                                'service.seistore.dev.tenant01.sproject01.admin@domain.com',
                                'service.seistore.dev.tenant01.sproject01.editor@domain.com'
                            ],
                            'viewers': [
                                'service.seistore.dev.tenant01.sproject01.viewer@domain.com'
                            ]
                        },
                        'ltag': 'ltag',
                        'enforce_key': false,
                        'access_policy': 'uniform'
                    },
                    {
                        'gcs_bucket': 'bucket',
                        'tenant': 'tenant01',
                        'storage_class': 'REGIONAL',
                        'storage_location': 'US-CENTRAL1',
                        'admin': 'person1@domain.com',
                        'name': 'person',
                        'acls': {
                            'admins': [
                                'data.sdms.tenant01.sproject02.be1221rt-564a-4d32-ty54-r37v2prt821r.admin@domain.com'
                            ],
                            'viewers': [
                                'data.sdms.tenant01.sproject02.db9621fd-64da-4d32-937a-d14f2bee519c.viewer@domain.com'
                            ]
                        },
                        'ltag': 'ltag',
                        'enforce_key': false,
                        'access_policy': 'dataset'
                    }
                ];

                this.dataset = {
                    name: 'dataset-test',
                    tenant: 'tenant01',
                    subproject: 'subproject-test'
                } as DatasetModel;

                this.journal = this.spy.createStubInstance(google.DatastoreDAO);
                Config.CLOUDPROVIDER = 'google';
            });
            afterEach(() => { this.spy.restore(); });

            this.add();
            this.remove();
            this.list();
            this.roles();
            this.others();

        });

    }

    private static spy: sinon.SinonSandbox;
    private static subproject: SubProjectModel;
    private static userGroups: IDESEntitlementGroupModel[];
    private static subprojectList: SubProjectModel[];
    private static dataset: DatasetModel;
    private static journal: any;


    private static add() {

        Tx.sectionInit('add');

        Tx.testExpAsync(async (expReq: expRequest, expRes: expResponse) => {
            expReq.body.email = 'user@user.com';
            expReq.body.path = 'sd://tnx/spx';
            expReq.body.group = 'editor';
            this.spy.stub(TenantDAO, 'get').resolves({} as any);
            this.spy.stub(AuthGroups, 'addUserToGroup');
            this.spy.stub(UserHandler, 'doNotThrowIfNotMember' as never).resolves();
            this.spy.stub(JournalFactoryTenantClient, 'get').returns(this.journal);
            this.spy.stub(SubProjectDAO, 'get').resolves(this.subproject);
            this.spy.stub(Auth, 'isImpersonationToken').returns(false);
            this.spy.stub(DatasetDAO, 'get').resolves([this.dataset, undefined]);
            await UserHandler.handler(expReq, expRes, UserOP.Add);
            Tx.check200(expRes.statusCode);
        });

        Tx.testExpAsync(async (expReq: expRequest, expRes: expResponse) => {
            expReq.body.email = 'user@user.com';
            expReq.body.path = 'sd://tnx/spx';
            expReq.body.group = 'viewer';
            this.spy.stub(TenantDAO, 'get').resolves({} as any);
            this.spy.stub(AuthGroups, 'addUserToGroup');
            this.spy.stub(UserHandler, 'doNotThrowIfNotMember' as never).resolves();
            this.spy.stub(JournalFactoryTenantClient, 'get').returns(this.journal);
            this.spy.stub(SubProjectDAO, 'get').resolves(this.subproject);
            this.spy.stub(Auth, 'isImpersonationToken').returns(false);
            this.spy.stub(DatasetDAO, 'get').resolves([this.dataset, undefined]);
            await UserHandler.handler(expReq, expRes, UserOP.Add);
            Tx.check200(expRes.statusCode);
        });

        Tx.testExpAsync(async (expReq: expRequest, expRes: expResponse) => {
            expReq.body.email = 'user@user.com';
            expReq.body.path = 'sd://tnx/spx';
            expReq.body.group = 'admin';
            this.spy.stub(AuthGroups, 'removeUserFromGroup').resolves();
            this.spy.stub(AuthGroups, 'addUserToGroup');
            this.spy.stub(UserHandler, 'doNotThrowIfNotMember' as never).resolves();
            this.spy.stub(TenantDAO, 'get').resolves({ name: 'tenant-a', esd: 'esd', gcpid: 'gcpid' } as any);
            this.spy.stub(JournalFactoryTenantClient, 'get').returns(this.journal);
            this.spy.stub(SubProjectDAO, 'get').resolves(this.subproject);
            this.spy.stub(Auth, 'isImpersonationToken').returns(false);
            this.spy.stub(DatasetDAO, 'get').resolves([this.dataset, undefined]);
            await UserHandler.handler(expReq, expRes, UserOP.Add);
            Tx.check200(expRes.statusCode);
        });

        Tx.testExpAsync(async (expReq: expRequest, expRes: expResponse) => {
            expReq.body.email = 'user@user.com';
            expReq.body.path = 'sd://tnx';
            this.spy.stub(TenantDAO, 'get').resolves({} as any);
            this.spy.stub(JournalFactoryTenantClient, 'get').returns(this.journal);
            this.spy.stub(SubProjectDAO, 'get').resolves(this.subproject);
            this.spy.stub(Auth, 'isImpersonationToken').returns(false);
            await UserHandler.handler(expReq, expRes, UserOP.Add);
            Tx.check400(expRes.statusCode);
        });

        Tx.testExpAsync(async (expReq: expRequest, expRes: expResponse) => {
            this.spy.stub(UserParser, 'addUser').returns(
                { email: '', sdPath: { tenant: 'tnx01', subproject: 'spx' } as SDPathModel, groupRole: 'none' });
            this.spy.stub(TenantDAO, 'get').resolves({} as any);
            this.spy.stub(Response, 'writeError');
            this.spy.stub(SubProjectDAO, 'get').resolves(this.subproject);
            this.spy.stub(JournalFactoryTenantClient, 'get').returns(this.journal);
            await UserHandler.handler(expReq, expRes, UserOP.Add);
        });

        Tx.testExpAsync(async (expReq: expRequest) => {
            expReq.body.email = 'user@user.com';
            expReq.body.path = 'wrong';
            try {
                UserParser.addUser(expReq);
            } catch (e) { Tx.check400(e.error.code); }
        });

        Tx.testExpAsync(async (expReq: expRequest) => {
            expReq.body.email = 'user@user.com';
            expReq.body.path = 'sd://';
            try {
                UserParser.addUser(expReq);
            } catch (e) { Tx.check400(e.error.code); }
        });

        Tx.testExpAsync(async (expReq: expRequest) => {
            expReq.body.email = 'user@user.com';
            expReq.body.path = 'sd://tnx/spx';
            expReq.body.group = 'wrong';
            try {
                UserParser.addUser(expReq);
            } catch (e) { Tx.check400(e.error.code); }
        });

    }

    private static remove() {

        Tx.sectionInit('remove');

        // Tx.testExpAsync(async (expReq: expRequest, expRes: expResponse) => {
        //     expReq.body.email = 'user2@user.com';
        //     expReq.body.path = 'sd://tnx/spx';
        //     this.spy.stub(TenantDAO, 'get').resolves({} as any);
        //     this.spy.stub(JournalFactoryTenantClient, 'get').returns(this.journal);
        //     this.spy.stub(AuthGroups, 'removeUserFromGroup');
        //     this.subproject.acls.admins = ['group1', 'group2'];
        //     this.subproject.acls.viewers = ['vGroup1', 'vGroup2'];
        //     this.spy.stub(SubProjectDAO, 'get').resolves(this.subproject);
        //     this.spy.stub(Auth, 'isImpersonationToken').returns(false);
        //     await UserHandler.handler(expReq, expRes, UserOP.Remove);
        //     Tx.check200(expRes.statusCode);
        // });

        Tx.testExpAsync(async (expReq: expRequest, expRes: expResponse) => {
            expReq.body.email = 'user2@user.com';
            expReq.body.path = 'sd://tnx';
            this.spy.stub(TenantDAO, 'get').resolves({} as any);
            this.spy.stub(JournalFactoryTenantClient, 'get').returns(this.journal);
            this.spy.stub(SubProjectDAO, 'get').resolves(this.subproject);
            this.spy.stub(Auth, 'isImpersonationToken').returns(false);
            this.spy.stub(SubprojectAuth, 'getAuthGroups').returns(['test']);
            this.spy.stub(Auth, 'isUserAuthorized').resolves(true);
            await UserHandler.handler(expReq, expRes, UserOP.Remove);
            Tx.check400(expRes.statusCode);
        });

        Tx.testExpAsync(async (expReq: expRequest, expRes: expResponse) => {
            expReq.body.email = 'user@user.com';
            expReq.body.path = 'sd://tnx/spx';
            this.spy.stub(Response, 'writeError');
            this.spy.stub(JournalFactoryTenantClient, 'get').returns(this.journal);
            this.spy.stub(SubProjectDAO, 'get').resolves(this.subproject);
            await UserHandler.handler(expReq, expRes, UserOP.Remove);
        });

        Tx.testExpAsync(async (expReq: expRequest) => {
            expReq.body.email = 'user@user.com';
            expReq.body.path = 'wrong';
            try {
                UserParser.removeUser(expReq);
            } catch (e) { Tx.check400(e.error.code); }
        });

        Tx.testExpAsync(async (expReq: expRequest) => {
            expReq.body.email = 'user@user.com';
            expReq.body.path = 'sd://';
            try {
                UserParser.removeUser(expReq);
            } catch (e) { Tx.check400(e.error.code); }
        });

    }

    private static list() {

        Tx.sectionInit('list');

        Tx.testExpAsync(async (expReq: expRequest, expRes: expResponse) => {
            expReq.query.sdpath = 'sd://tnx/spx';
            this.spy.stub(TenantDAO, 'get').resolves({} as any);
            this.spy.stub(Auth, 'isUserAuthorized');
            this.spy.stub(AuthGroups, 'listUsersInGroup').resolves([{ email: 'userX' }] as never);
            this.spy.stub(SubProjectDAO, 'get').resolves(this.subproject);
            this.spy.stub(Auth, 'isImpersonationToken').returns(false);
            await UserHandler.handler(expReq, expRes, UserOP.List);
            Tx.check200(expRes.statusCode);
        });

        Tx.testExpAsync(async (expReq: expRequest) => {
            expReq.query.sdpath = 'wrong';
            try {
                UserParser.listUsers(expReq);
            } catch (e) { Tx.check400(e.error.code); }
        });

        Tx.testExpAsync(async (expReq: expRequest) => {
            expReq.query.sdpath = 'sd://tnx';
            try {
                UserParser.listUsers(expReq);
            } catch (e) { Tx.check400(e.error.code); }
        });

    }

    private static roles() {

        Tx.sectionInit('roles');

        Tx.testExpAsync(async (expReq: expRequest, expRes: expResponse) => {
            expReq.query.sdpath = 'sd://tenant01/subproject01';
            this.spy.stub(TenantDAO, 'get').resolves({} as any);
            this.spy.stub(AuthGroups, 'getUserGroups').resolves(this.userGroups);
            this.spy.stub(SubProjectDAO, 'list').resolves(this.subprojectList);
            this.spy.stub(Auth, 'isImpersonationToken').returns(false);
            await UserHandler.handler(expReq, expRes, UserOP.Roles);
            Tx.check200(expRes.statusCode);
        });

        Tx.testExpAsync(async (expReq: expRequest, expRes: expResponse) => {
            expReq.query.sdpath = 'sd://tenant01';
            this.spy.stub(TenantDAO, 'get').resolves({} as any);
            this.spy.stub(AuthGroups, 'getUserGroups').resolves(this.userGroups);
            this.spy.stub(SubProjectDAO, 'list').resolves(this.subprojectList);
            this.spy.stub(Auth, 'isImpersonationToken').returns(false);
            await UserHandler.handler(expReq, expRes, UserOP.Roles);
            Tx.check200(expRes.statusCode);
        });

        Tx.testExpAsync(async (expReq: expRequest) => {
            expReq.query.sdpath = 'wrong';
            try {
                UserParser.rolesUser(expReq);
            } catch (e) { Tx.check400(e.error.code); }
        });

        Tx.testExpAsync(async (expReq: expRequest) => {
            expReq.query.sdpath = 'sd://';
            try {
                UserParser.rolesUser(expReq);
            } catch (e) { Tx.check400(e.error.code); }
        });

    }

    private static others() {

        Tx.sectionInit('others');

        Tx.testExpAsync(async (expReq: expRequest, expRes: expResponse) => {
            this.spy.stub(Auth, 'isImpersonationToken').returns(true);
            await UserHandler.handler(expReq, expRes, UserOP.Add);
            Tx.check403(expRes.statusCode);
        });

        Tx.testExpAsync(async (expReq: expRequest, expRes: expResponse) => {
            await UserHandler.handler(expReq, expRes, undefined);
        });

    }

}
