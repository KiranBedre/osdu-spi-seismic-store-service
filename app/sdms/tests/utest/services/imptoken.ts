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
import jwt from 'jsonwebtoken';
import axios from 'axios';
import sinon from 'sinon';
import { Auth } from '../../../src/auth';
import { Config, google } from '../../../src/cloud';
import { ImpTokenDAO } from '../../../src/services/imptoken';
import { ImpTokenHandler } from '../../../src/services/imptoken/handler';
import { IImpTokenBodyModel as ImpTokenBodyModel, IResourceModel } from '../../../src/services/imptoken/model';
import { ImpTokenOP } from '../../../src/services/imptoken/optype';
import { ImpTokenParser } from '../../../src/services/imptoken/parser';
import { SubProjectDAO, SubProjectModel } from '../../../src/services/subproject';
import { TenantDAO } from '../../../src/services/tenant';
import { Response } from '../../../src/shared';
import { Tx } from '../utils';


export class TestImpTokenSVC {
    public static userAuthExp: string;
    public static userAuthExp0: string;
    public static impToken: string;
    public static impTokenNoValid: string;
    public static requestError: object;

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

        Config.IMP_SERVICE_ACCOUNT_SIGNER = 'signer@seistore.com';

        const payloadOK = {
            iss: Config.IMP_SERVICE_ACCOUNT_SIGNER, obo: 'user',
            rsrc: [{ resource: 'resource', readonly: true }],
            rurl: 'none',
        };

        const payloadWrongIss = {
            iss: 'unknown', obo: 'user',
            rsrc: [{ resource: 'resource', readonly: true }],
            rurl: 'none',
        };

        const payloadWrong = {
            iss: Config.IMP_SERVICE_ACCOUNT_SIGNER,
            rsrc: [{ resource: 'resource', readonly: true }],
            rurl: 'none',
        };

        this.tokenOK = jwt.sign(payloadOK, 'my_secret', { keyid: '0' });
        this.tokenNoKid = jwt.sign(payloadOK, 'my_secret');
        this.tokenWrongIss = jwt.sign(payloadWrongIss, 'my_secret', { keyid: '0' });
        this.tokenWrong = jwt.sign(payloadWrong, 'my_secret', { keyid: '0' });

        this.userAuthExp = 'header.' + Buffer.from(JSON.stringify({
            email: 'user@user.com', exp: Date.now(),
        })).toString('base64') + '.signature';

        this.userAuthExp0 = 'header.' + Buffer.from(JSON.stringify({
            email: 'user@user.com', exp: 0,
        })).toString('base64') + '.signature';

        this.impToken = 'header.' + Buffer.from(JSON.stringify({
            iss: Config.IMP_SERVICE_ACCOUNT_SIGNER, obo: 'obo', rsrc: 'rsrc',
            rurl: 'rurl',
        })).toString('base64') + '.signature';

        this.impTokenNoValid = 'header.' + Buffer.from(JSON.stringify({
            iss: Config.IMP_SERVICE_ACCOUNT_SIGNER,
            obo: 'obo', rsrc: 'rsrc',
        })).toString('base64') + '.signature';

        this.requestError = { name: 'StatusCodeError', statusCode: 500, message: 'error' };

        describe(Tx.testInit('imptoken'), () => {

            beforeEach(() => {
                this.spy = sinon.createSandbox();
                this.spy.stub(Response, 'writeMetric').returns();
            });
            afterEach(() => { this.spy.restore(); });

            this.create();
            this.refresh();
            this.patch();
            this.others();

        });

    }

    private static spy: sinon.SinonSandbox;
    private static tokenOK: string;
    private static tokenNoKid: string;
    private static tokenWrongIss: string;
    private static tokenWrong: string;
    private static testSubProject: SubProjectModel;


    private static create() {

        Tx.sectionInit('create');

        Tx.testExpAsync(async (expReq: expRequest, expRes: expResponse) => {
            expReq.body.token = this.userAuthExp;
            expReq.body.resources = [{ readonly: true, resource: 'sd://tnx/spx' }];
            expReq.body['refresh-url'] = 'https://httpstat.us/200';
            this.spy.stub(TenantDAO, 'get').resolves({} as any);
            this.spy.stub(Auth, 'isAppAuthorized').resolves(undefined);
            this.spy.stub(Auth, 'isReadAuthorized').resolves(true);
            this.spy.stub(Auth, 'isWriteAuthorized').resolves(true);
            this.spy.stub(ImpTokenDAO, 'create').resolves(undefined);
            this.spy.stub(SubProjectDAO, 'get').resolves(this.testSubProject);
            this.spy.stub(Auth, 'isImpersonationToken').returns(false);
            await ImpTokenHandler.handler(expReq, expRes, ImpTokenOP.Generate);
            Tx.check200(expRes.statusCode);
        });

        Tx.testExpAsync(async (expReq: expRequest, expRes: expResponse) => {
            expReq.body.token = this.userAuthExp;
            expReq.body.resources = [{ readonly: false, resource: 'sd://tnx/spx' }];
            expReq.body['refresh-url'] = 'https://httpstat.us/200';
            this.spy.stub(TenantDAO, 'get').resolves({} as any);
            this.spy.stub(SubProjectDAO, 'get').resolves(this.testSubProject);
            this.spy.stub(Auth, 'isAppAuthorized').resolves(undefined);
            this.spy.stub(Auth, 'isReadAuthorized').resolves(false);
            this.spy.stub(Auth, 'isWriteAuthorized').resolves(false);
            this.spy.stub(Response, 'writeError').returns(undefined);
            await ImpTokenHandler.handler(expReq, expRes, ImpTokenOP.Generate);
        });

        Tx.testExpAsync(async (expReq: expRequest, expRes: expResponse) => {
            expReq.body.token = this.userAuthExp;
            expReq.body.resources = [{ readonly: true, resource: 'sd://tnx/spx' }];
            expReq.body['refresh-url'] = 'https://httpstat.us/200';
            this.spy.stub(TenantDAO, 'get').resolves({} as any);
            this.spy.stub(SubProjectDAO, 'get').resolves(this.testSubProject);
            this.spy.stub(Auth, 'isAppAuthorized').resolves(undefined);
            this.spy.stub(Auth, 'isReadAuthorized').resolves(false);
            this.spy.stub(Auth, 'isWriteAuthorized').resolves(false);
            this.spy.stub(Response, 'writeError').returns(undefined);
            await ImpTokenHandler.handler(expReq, expRes, ImpTokenOP.Generate);
        });

        Tx.testExpAsync(async (expReq: expRequest, expRes: expResponse) => {
            const temp = Config.CLOUDPROVIDER;
            Config.CLOUDPROVIDER = 'azure'
            expReq.body.token = this.userAuthExp;
            expReq.body.resources = [{ readonly: true, resource: 'sd://tnx/spx' }];
            expReq.body['refresh-url'] = 'https://httpstat.us/200';
            this.spy.stub(TenantDAO, 'get').resolves({} as any);
            this.spy.stub(SubProjectDAO, 'get').resolves(this.testSubProject);
            this.spy.stub(Auth, 'isAppAuthorized').resolves(undefined);
            this.spy.stub(Auth, 'isReadAuthorized').resolves(false);
            this.spy.stub(Auth, 'isWriteAuthorized').resolves(false);
            this.spy.stub(Response, 'writeError').returns(undefined);
            await ImpTokenHandler.handler(expReq, expRes, ImpTokenOP.Generate);
            Config.CLOUDPROVIDER = temp;
        });

        Tx.testExpAsync(async (expReq: expRequest, expRes: expResponse) => {
            const temp = Config.CLOUDPROVIDER;
            Config.CLOUDPROVIDER = 'aws'
            expReq.body.token = this.userAuthExp;
            expReq.body.resources = [{ readonly: true, resource: 'sd://tnx/spx' }];
            expReq.body['refresh-url'] = 'https://httpstat.us/200';
            this.spy.stub(TenantDAO, 'get').resolves({} as any);
            this.spy.stub(SubProjectDAO, 'get').resolves(this.testSubProject);
            this.spy.stub(Auth, 'isAppAuthorized').resolves(undefined);
            this.spy.stub(Auth, 'isReadAuthorized').resolves(false);
            this.spy.stub(Auth, 'isWriteAuthorized').resolves(false);
            this.spy.stub(Response, 'writeError').returns(undefined);
            await ImpTokenHandler.handler(expReq, expRes, ImpTokenOP.Generate);
            Config.CLOUDPROVIDER = temp;
        });


        // [TO REVIEW]
        Tx.testExpAsync(async (expReq: expRequest, expRes: expResponse) => {
            expReq.body.token = this.userAuthExp0;
            expReq.body.resources = [{ readonly: true, resource: 'sd://tnx/spx' }];
            expReq.body['refresh-url'] = 'https://httpstat.us/200';
            try {
                ImpTokenParser.create(expReq);
            } catch (e) { Tx.check400(e.error.code); }
        });

        // [TO REVIEW]
        Tx.testExpAsync(async (expReq: expRequest, expRes: expResponse) => {
            expReq.body.token = this.userAuthExp;
            expReq.body.resources = [];
            expReq.body['refresh-url'] = 'https://httpstat.us/200';
            try {
                ImpTokenParser.create(expReq);
            } catch (e) { Tx.check400(e.error.code); }
        });

        // [TO REVIEW]
        Tx.testExpAsync(async (expReq: expRequest, expRes: expResponse) => {
            expReq.body.token = this.userAuthExp;
            expReq.body.resources = [{ readonly: true, resource: 'sd://tnx' }];
            expReq.body['refresh-url'] = 'https://httpstat.us/200';
            try {
                ImpTokenParser.create(expReq);
            } catch (e) { Tx.check400(e.error.code); }
        });

        // [TO REVIEW]
        Tx.testExpAsync(async (expReq: expRequest, expRes: expResponse) => {
            expReq.body.token = this.userAuthExp;
            expReq.body.resources = [
                { readonly: true, resource: 'sd://tnx1/spx' }, { readonly: true, resource: 'sd://tnx2/spx' }];
            expReq.body['refresh-url'] = 'https://httpstat.us/200';
            try {
                ImpTokenParser.create(expReq);
            } catch (e) { Tx.check400(e.error.code); }
        });

        Tx.testExpAsync(async (expReq: expRequest) => {
            expReq.body.token = this.userAuthExp;
            expReq.body.resources = [
                { readonly: true, resource: 'sd://tnx/spx1' },
                { readonly: false, resource: 'sd://tnx/spx1' },
                { resource: 'sd://tnx/spx2' }];
            expReq.body['refresh-url'] = 'https://httpstat.us/200';
            await ImpTokenParser.create(expReq);
        });

        Tx.test(async () => {
            this.spy.stub(google.Credentials.prototype, 'getServiceAccountAccessToken').resolves({
                access_token: 'token', expires_in: 3600, token_type: 'Bearer'
            });
            this.spy.stub(jwt, 'sign').resolves('jwt-token');
            this.spy.stub(axios, 'get').resolves({status: 200, data: {signedJwt: "token"}});
            this.spy.stub(axios, 'post').resolves({status: 200, data: {signedJwt: "token"}});
            const resourceModel: IResourceModel = {
                readonly: false,
                resource: 'resource',
            } as IResourceModel;
            const impToken: ImpTokenBodyModel = {
                iat: 0,
                refreshUrl: 'url',
                resources: [resourceModel],
                user: 'userA',
                userToken: 'token',
            };
            await ImpTokenDAO.create(impToken);
        });

        // Tx.test(async () => {
        //     this.spy.stub(jwt, 'sign').resolves('jwt-token');
        //     this.spy.stub(request, 'post').rejects(this.requestError);
        //     try {
        //         await ImpTokenDAO.create({ iat: Date.now() } as ImpTokenBodyModel);
        //     } catch (e) { Tx.check500(e.error.code); }
        // });
    }

    private static refresh() {

        Tx.sectionInit('refresh');

        Tx.testExpAsync(async (expReq: expRequest, expRes: expResponse) => {
            expReq.body.token = this.impToken;
            this.spy.stub(TenantDAO, 'get').resolves({} as any);
            this.spy.stub(SubProjectDAO, 'get').resolves(this.testSubProject);
            this.spy.stub(ImpTokenDAO, 'validate').resolves({ refreshUrl: '' } as any);
            this.spy.stub(ImpTokenDAO, 'canBeRefreshed').resolves(undefined);
            this.spy.stub(ImpTokenDAO, 'create').resolves(undefined);
            await ImpTokenHandler.handler(expReq, expRes, ImpTokenOP.Refresh);
            Tx.check200(expRes.statusCode);
        });

        Tx.testExpAsync(async (expReq: expRequest) => {
            expReq.body.token = 'xxx';
            try {
                ImpTokenParser.refresh(expReq);
            } catch (e) { Tx.check400(e.error.code); }
        });

        Tx.testExpAsync(async (expReq: expRequest) => {
            expReq.body.token = expReq.headers.authorization;
            try {
                ImpTokenParser.refresh(expReq);
            } catch (e) { Tx.check400(e.error.code); }
        });

        Tx.testExpAsync(async (expReq: expRequest) => {
            expReq.body.token = this.impTokenNoValid;
            try {
                ImpTokenParser.refresh(expReq);
            } catch (e) { Tx.check400(e.error.code); }
        });

        Tx.test(async () => {
            this.spy.stub(axios, 'get').resolves();
            await ImpTokenDAO.canBeRefreshed('https://google.com');
        });

        Tx.test(async () => {
            this.spy.stub(axios, 'get').resolves();
            try {
                await ImpTokenDAO.canBeRefreshed('google.com');
            } catch (e) { return; } // ignore exceptions
            
        });

        // Tx.test(async () => {
        //     this.spy.stub(axios, 'get').resolves();
        //     this.spy.stub(JSON, 'parse').resolves();
        //     await ImpTokenDAO.canBeRefreshed('htt://google.com');
        //
        // });

        // Tx.test(async () => {
        //     this.spy.stub(axios, 'get').rejects(this.requestError);
        //     try {
        //         await ImpTokenDAO.canBeRefreshed('https://url');
        //         console.log('1');
        //     } catch (e) { 
        //         Tx.check400(e.error.code); 
        //
        //     }
        // });

        Tx.test(async () => {
            this.spy.stub(axios, 'get').resolves({data:["my_secret"]});
            await ImpTokenDAO.validate(this.tokenOK);
        });

        Tx.test(async () => {
            this.spy.stub(axios, 'get').rejects(this.requestError);
            try {
                await ImpTokenDAO.validate(this.tokenOK);
            } catch (e) { Tx.check500(e.error.code); }
        });

        Tx.test(async () => {
            this.spy.stub(axios, 'get').resolves({data:["my_secret"]});
            try {
                await ImpTokenDAO.validate(this.tokenNoKid);
            } catch (e) { Tx.check400(e.error.code); }
        });

        Tx.test(async () => {
            this.spy.stub(axios, 'get').resolves('[]');
            try {
                await ImpTokenDAO.validate(this.tokenOK);
            } catch (e) { Tx.check400(e.error.code); }
        });

        Tx.test(async () => {
            this.spy.stub(axios, 'get').resolves({data:["my_secret"]});
            this.spy.stub(jwt, 'verify').throws({ name: 'TokenExpiredError' });
            await ImpTokenDAO.validate(this.tokenOK, true);
        });

        Tx.test(async () => {
            this.spy.stub(axios, 'get').resolves({data:["my_secret"]});
            this.spy.stub(jwt, 'verify').throws({ name: 'TokenExpiredError' });
            try {
                await ImpTokenDAO.validate(this.tokenOK, false);
            } catch (e) { Tx.check400(e.error.code); }
        });

        Tx.test(async () => {
            this.spy.stub(axios, 'get').resolves({data:["my_secret"]});
            try {
                await ImpTokenDAO.validate(this.tokenWrongIss);
            } catch (e) { Tx.check400(e.error.code); }
        });

        Tx.test(async () => {
            this.spy.stub(axios, 'get').resolves({data:["my_secret"]});
            try {
                await ImpTokenDAO.validate(this.tokenWrong);
            } catch (e) { Tx.check400(e.error.code); }
        });

    }

    private static patch() {

        Tx.sectionInit('patch');

        Tx.testExpAsync(async (expReq: expRequest, expRes: expResponse) => {
            expReq.body.token = this.impToken;
            expReq.body['refresh-url'] = 'https://httpstat.us/200';
            this.spy.stub(TenantDAO, 'get').resolves({} as any);
            this.spy.stub(SubProjectDAO, 'get').resolves(this.testSubProject);
            this.spy.stub(ImpTokenDAO, 'validate').resolves({ refreshUrl: '' } as any);
            this.spy.stub(ImpTokenDAO, 'create').resolves(undefined);
            this.spy.stub(Auth, 'isImpersonationToken').returns(false);
            await ImpTokenHandler.handler(expReq, expRes, ImpTokenOP.Patch);
            Tx.check200(expRes.statusCode);
        });

        Tx.testExpAsync(async (expReq: expRequest) => {
            expReq.body.token = expReq.headers.authorization;
            expReq.body['refresh-url'] = 'https://httpstat.us/200';
            try {
                ImpTokenParser.patch(expReq);
            } catch (e) { Tx.check400(e.error.code); }
        });

        Tx.testExpAsync(async (expReq: expRequest) => {
            expReq.body.token = this.impTokenNoValid;
            expReq.body['refresh-url'] = 'https://httpstat.us/200';
            try {
                ImpTokenParser.patch(expReq);
            } catch (e) { Tx.check400(e.error.code); }
        });

    }

    private static others() {

        Tx.sectionInit('others');

        Tx.testExpAsync(async (expReq: expRequest, expRes: expResponse) => {
            this.spy.stub(Auth, 'isImpersonationToken').returns(true);
            await ImpTokenHandler.handler(expReq, expRes, ImpTokenOP.Generate);
            Tx.check403(expRes.statusCode);
        });

        Tx.test(async () => {
            ImpTokenDAO.getImpTokenBody(this.tokenOK);
        });

    }

}
