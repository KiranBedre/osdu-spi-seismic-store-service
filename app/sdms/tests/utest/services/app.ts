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

import { Request as expRequest, Response as expResponse } from 'express';
import { Auth } from '../../../src/auth';
import { AppHandler } from '../../../src/services/svcapp/handler';
import { AppOp } from '../../../src/services/svcapp/optype';
import { AppParser } from '../../../src/services/svcapp/parser';
import { TenantAuth, TenantDAO } from '../../../src/services/tenant';
import { AppsDAO } from '../../../src/services/svcapp/dao';
import { Response } from '../../../src/shared';
import { Tx } from '../utils';

export class TestAppSVC {

    public static run() {

        describe(Tx.testInit('svcapp'), () => {

            beforeEach(() => { this.spy = sinon.createSandbox();
                               this.spy.stub(Response, 'writeMetric').returns() });

            afterEach(() => { this.spy.restore(); });

            this.register();
            this.registerTrusted();
            this.list();
            this.listTrusted();
            this.others();

        });

    }

    private static spy: sinon.SinonSandbox;

    private static register() {

        Tx.sectionInit('register');

        Tx.testExp(async (done: any, expReq: expRequest, expRes: expResponse) => {
            expReq.query.email = 'user@user.com';
            expReq.query.sdpath = 'sd://tnx';
            this.spy.stub(TenantDAO, 'get').resolves({} as any);
            this.spy.stub(TenantAuth, 'getAuthGroups').returns([]);
            this.spy.stub(Auth, 'isUserAuthorized');
            this.spy.stub(AppsDAO, 'get').resolves(undefined);
            this.spy.stub(AppsDAO, 'register').resolves(undefined);
            this.spy.stub(Auth, 'isImpersonationToken').returns(false);
            await AppHandler.handler(expReq, expRes, AppOp.Register);
            Tx.check200(expRes.statusCode, done);
        });

        Tx.testExp(async (done: any, expReq: expRequest) => {
            expReq.query.email = 'user@user.com';
            expReq.query.sdpath = 'sdx://tnx';
            try {
                AppParser.register(expReq);
            } catch (e) { Tx.check400(e.error.code, done); }
        });

        Tx.testExp(async (done: any, expReq: expRequest) => {
            expReq.query.email = 'user@user.com';
            expReq.query.sdpath = 'sd://';
            try {
                AppParser.register(expReq);
            } catch (e) { Tx.check400(e.error.code, done); }
        });

    }

    private static registerTrusted() {

        Tx.sectionInit('register trusted');

        Tx.testExp(async (done: any, expReq: expRequest, expRes: expResponse) => {
            expReq.query.email = 'user@user.com';
            expReq.query.sdpath = 'sd://tnx';
            this.spy.stub(TenantDAO, 'get').resolves({} as any);
            this.spy.stub(TenantAuth, 'getAuthGroups').returns([]);
            this.spy.stub(Auth, 'isUserAuthorized');
            this.spy.stub(Auth, 'isAppAuthorized');
            this.spy.stub(AppsDAO, 'get').resolves({ email: 'x', trusted: false });
            this.spy.stub(AppsDAO, 'register').resolves(undefined);
            this.spy.stub(Auth, 'isImpersonationToken').returns(false);
            await AppHandler.handler(expReq, expRes, AppOp.RegisterTrusted);
            Tx.check200(expRes.statusCode, done);
        });

        Tx.testExp(async (done: any, expReq: expRequest, expRes: expResponse) => {
            expReq.query.email = 'user@user.com';
            expReq.query.sdpath = 'sd://tnx';
            this.spy.stub(TenantDAO, 'get').resolves({} as any);
            this.spy.stub(TenantAuth, 'getAuthGroups').returns([]);
            this.spy.stub(Auth, 'isUserAuthorized');
            this.spy.stub(Auth, 'isAppAuthorized');
            this.spy.stub(AppsDAO, 'get').resolves();
            this.spy.stub(AppsDAO, 'register').resolves(undefined);
            this.spy.stub(Auth, 'isImpersonationToken').returns(false);
            await AppHandler.handler(expReq, expRes, AppOp.RegisterTrusted);
            Tx.check400(expRes.statusCode, done);
        });

    }

    private static list() {

        Tx.sectionInit('list');

        Tx.testExp(async (done: any, expReq: expRequest, expRes: expResponse) => {
            expReq.query.sdpath = 'sd://tnx';
            this.spy.stub(TenantDAO, 'get').resolves({} as any);
            this.spy.stub(TenantAuth, 'getAuthGroups').returns([]);
            this.spy.stub(Auth, 'isUserAuthorized');
            this.spy.stub(AppsDAO, 'list').resolves([]);
            this.spy.stub(Auth, 'isImpersonationToken').returns(false);
            await AppHandler.handler(expReq, expRes, AppOp.List);
            Tx.check200(expRes.statusCode, done);
        });

        Tx.testExp(async (done: any, expReq: expRequest) => {
            expReq.query.sdpath = 'sdx://tnx';
            try {
                AppParser.list(expReq);
            } catch (e) { Tx.check400(e.error.code, done); }
        });

        Tx.testExp(async (done: any, expReq: expRequest) => {
            expReq.query.sdpath = 'sd://';
            try {
                AppParser.list(expReq);
            } catch (e) { Tx.check400(e.error.code, done); }
        });

    }

    private static listTrusted() {

        Tx.sectionInit('list trusted');

        Tx.testExp(async (done: any, expReq: expRequest, expRes: expResponse) => {
            expReq.query.sdpath = 'sd://tnx';
            this.spy.stub(TenantDAO, 'get').resolves({} as any);
            this.spy.stub(TenantAuth, 'getAuthGroups').returns([]);
            this.spy.stub(Auth, 'isUserAuthorized');
            this.spy.stub(AppsDAO, 'list').resolves([]);
            this.spy.stub(Auth, 'isImpersonationToken').returns(false);
            await AppHandler.handler(expReq, expRes, AppOp.ListTrusted);
            Tx.check200(expRes.statusCode, done);
        });

    }

    private static others() {

        Tx.sectionInit('others');

        Tx.testExp(async (done: any, expReq: expRequest, expRes: expResponse) => {
            this.spy.stub(Auth, 'isImpersonationToken').returns(true);
            await AppHandler.handler(expReq, expRes, AppOp.List);
            Tx.check403(expRes.statusCode, done);
        });

        Tx.testExp(async (done: any, expReq: expRequest, expRes: expResponse) => {
            await AppHandler.handler(expReq, expRes, undefined);
            done();
        });

    }

}
