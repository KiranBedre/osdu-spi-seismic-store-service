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
import { Auth, AuthProviderFactory, AuthRoles } from '../../../../src/auth';
import { IAuthProvider } from '../../../../src/auth/auth';
import { Config, JournalFactoryTenantClient } from '../../../../src/cloud';
import { SeistoreFactory } from '../../../../src/cloud/seistore';
import { Error, Feature, FeatureFlags, Params, Response, Utils } from '../../../../src/shared';
import { SubprojectAuth, SubProjectDAO, SubProjectModel } from '../../../../src/services/subproject';
import { TenantDAO } from '../../../../src/services/tenant';
import { ITenantModel } from '../../../../src/services/tenant/model';
import { ISDPathModel, SDPath } from '../../../../src/shared/sdpath';
import { ImpersonationTokenContextModel, ImpersonationTokenModel, ImpersonationTokenRequestBodyModel } from '../../../../src/services/impersonation_token/model';
import { ImpersonationTokenOps } from '../../../../src/services/impersonation_token/optype';
import { ImpersonationTokenParser } from '../../../../src/services/impersonation_token/parser';
import { ImpersonationTokenHandler as Handler } from '../../../../src/services/impersonation_token/handler';
import { Tx } from '../../utils';

export class TestParser {

    private static sandbox: sinon.SinonSandbox;

    public static run() {

        describe(Tx.testInit("ImpersonationToken/Parser"), () => {

            this.sandbox = sinon.createSandbox();
            let tenantModel: ITenantModel = {
                name: "name",
                esd: "esd.esd",
                gcpid: '',
                default_acls: ''
            };
            let isdPathModel: ISDPathModel = {
                tenant: 'tenant',
                subproject: 'subproject-a',
                path: 'path',
                dataset: 'dataset'
            };
            let subProjectModel: SubProjectModel = {
                name: 'name',
                tenant: 'tenant',
                admin: '',
                storage_class: '',
                storage_location: '',
                ltag: '',
                gcs_bucket: '',
                enforce_key: false,
                acls: { admins: [], viewers: [] },
                access_policy: ''
            };
            let impersonationTokenRequestBodyModel: ImpersonationTokenRequestBodyModel = {
                resources: [ {resource: "resource/resource", readonly: false} ],
                userToken: 'Bearer user-token',
                metadata: {}
            };
            let iAuthProvider: IAuthProvider = {
                generateAuthCredential: function (): Promise<any> {
                    throw new Error();
                },
                generateScopedAuthCredential: function (scopes: string[]): Promise<any> {
                    let executor = sinon.fake();
                    let promise = sinon.promise(executor);
                    return promise.resolve({});
                },
                convertToImpersonationTokenModel: function (credential: any): ImpersonationTokenModel {
                    return credential as ImpersonationTokenModel;
                },
                getClientID: function (): string {
                    return "ClientID";
                },
                getClientSecret: function (): string {
                    return "ClientSecret";
                },
                exchangeCredentialAudience: function (credential: string, audience: string): Promise<string> {
                    throw new Error();
                }
            };
            //beforeEach(() => {  });
            afterEach(() => { this.sandbox.restore(); });

            this.generateTest(tenantModel, subProjectModel, isdPathModel);
            // this.refreshImpersonationTokenTest(tenantModel, iAuthProvider);
            // this.errorTokenTest();

        });
    }

    private static generateTest(tenantModel: ITenantModel, subProjectModel: SubProjectModel, isdPathModel: ISDPathModel) {

        Tx.sectionInit("generateImpersonationTokenTest");

        Tx.testExp(async (done: any, req: expRequest, res: expResponse, op: ImpersonationTokenOps) => {

            op = ImpersonationTokenOps.Generate;

            req.headers['user-token'] = "Bearer user-token";
            req.params.userId = "userId";

            req.body = {};
            req.body.resources = "resources";
            req.body.metadata = "metadata";

            //
            //

            this.sandbox.stub(Auth, 'isImpersonationToken').returns(false);
            this.sandbox.stub(Auth, 'isAppAuthorized').resolves(true);
            this.sandbox.stub(Auth, 'isWriteAuthorized').resolves(true);
            // this.sandbox.stub(ImpersonationTokenParser, "generate").resolves(impersonationTokenRequestBodyModel);
            this.sandbox.stub(TenantDAO, "get").resolves(tenantModel);
            this.sandbox.stub(Utils, "getExpTimeFromPayload").resolves(100);
            this.sandbox.stub(Utils, "getUserId").returns(new Promise(()=>req.params.userId));
            this.sandbox.stub(Params, "checkArray").resolves();
            this.sandbox.stub(Params, "checkObject").resolves(true);
            this.sandbox.stub(Params, "checkString").resolves(true);
            this.sandbox.stub(Params, "checkBoolean").resolves();
            this.sandbox.stub(SDPath, "getFromString").returns(isdPathModel);
            this.sandbox.stub(Error, "make").throws();
            this.sandbox.stub(SubProjectDAO, "get").resolves(subProjectModel);

            await ImpersonationTokenParser.generate(req);
            done();

        });
        
        Tx.testExp(async (done: any, req: expRequest, res: expResponse, op: ImpersonationTokenOps) => {

            op = ImpersonationTokenOps.Generate;

            req.headers['user-token'] = "Bearer user-token";
            req.params.userId = "userId";

            req.body = {};
            req.body.resources = "";
            req.body.metadata = "metadata";
            //
            //

            this.sandbox.stub(Auth, 'isImpersonationToken').returns(false);
            this.sandbox.stub(Auth, 'isAppAuthorized').resolves(true);
            this.sandbox.stub(Auth, 'isWriteAuthorized').resolves(true);
            // this.sandbox.stub(ImpersonationTokenParser, "generate").resolves(impersonationTokenRequestBodyModel);
            this.sandbox.stub(TenantDAO, "get").resolves(tenantModel);
            this.sandbox.stub(Utils, "getExpTimeFromPayload").resolves(100);
            this.sandbox.stub(Utils, "getUserId").returns(new Promise(()=>req.params.userId));
            this.sandbox.stub(Params, "checkArray").resolves();
            this.sandbox.stub(Params, "checkObject").resolves(true);
            this.sandbox.stub(Params, "checkString").resolves(true);
            this.sandbox.stub(Params, "checkBoolean").resolves();
            this.sandbox.stub(SDPath, "getFromString").returns(isdPathModel);
            this.sandbox.stub(Error, "make").throws();
            this.sandbox.stub(SubProjectDAO, "get").resolves(subProjectModel);
            // this.sandbox.stub(AuthProviderFactory, "build").returns(iAuthProvider);

            try {
                await ImpersonationTokenParser.generate(req);
            } catch (e) {
                Tx.checkTrue(typeof e === 'object', done);
            }
            
            
        });
        
    }

}