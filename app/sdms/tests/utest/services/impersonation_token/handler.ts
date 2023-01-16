import sinon from 'sinon';
import { Request as expRequest, Response as expResponse } from 'express';
import { Auth, AuthProviderFactory, AuthRoles } from '../../../../src/auth';
import { IAuthProvider } from '../../../../src/auth/auth';
import { Config, JournalFactoryTenantClient } from '../../../../src/cloud';
import { SeistoreFactory } from '../../../../src/cloud/seistore';
import { Error, Feature, FeatureFlags, Response, Utils } from '../../../../src/shared';
import { SubprojectAuth, SubProjectDAO, SubProjectModel } from '../../../../src/services/subproject';
import { TenantDAO } from '../../../../src/services/tenant';
import { ITenantModel } from '../../../../src/services/tenant/model';
import { ImpersonationTokenContextModel, ImpersonationTokenModel, ImpersonationTokenRequestBodyModel } from '../../../../src/services/impersonation_token/model';
import { ImpersonationTokenOps } from '../../../../src/services/impersonation_token/optype';
import { ImpersonationTokenParser } from '../../../../src/services/impersonation_token/parser';
import { ImpersonationTokenHandler as Handler } from '../../../../src/services/impersonation_token/handler';
import { Tx } from '../../utils';

export class TestImpersonationTokenHandler {

    private static sandbox: sinon.SinonSandbox;

    public static run() {

        describe(Tx.testInit("ImpersonationToken/Handler"), () => {

            this.sandbox = sinon.createSandbox();
            let tenantModel: ITenantModel = {
                name: "name",
                esd: "esd.esd",
                gcpid: '',
                default_acls: ''
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

            this.generateImpersonationTokenTest(tenantModel, subProjectModel, impersonationTokenRequestBodyModel, iAuthProvider);
            this.refreshImpersonationTokenTest(tenantModel, iAuthProvider);
            this.errorTokenTest();

        } );
    };

    private static generateImpersonationTokenTest(tenantModel: ITenantModel, subProjectModel: SubProjectModel, impersonationTokenRequestBodyModel: ImpersonationTokenRequestBodyModel, iAuthProvider: IAuthProvider) {

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
            this.sandbox.stub(ImpersonationTokenParser, "generate").resolves(impersonationTokenRequestBodyModel);
            this.sandbox.stub(TenantDAO, "get").resolves(tenantModel);
            this.sandbox.stub(Utils, "getUserId").resolves(req.params.userId);
            this.sandbox.stub(SubProjectDAO, "get").resolves(subProjectModel);
            this.sandbox.stub(AuthProviderFactory, "build").returns(iAuthProvider);
            await Handler.handler(req, res, op);
            Tx.check200(res.statusCode, done)

        } );

        Tx.testExp(async (done: any, req: expRequest, res: expResponse, op: ImpersonationTokenOps) => {

            op = ImpersonationTokenOps.Generate;

            req.headers['user-token'] = "Bearer user-token";
            req.params.userId = "userId";

            req.body = {};
            req.body.resources = "resources";
            req.body.metadata = "metadata";

            this.sandbox.stub(Auth, 'isImpersonationToken').returns(false);
            this.sandbox.stub(Auth, 'isAppAuthorized').resolves(true);
            this.sandbox.stub(Auth, 'isWriteAuthorized').resolves(true);
            this.sandbox.stub(ImpersonationTokenParser, "generate").resolves(impersonationTokenRequestBodyModel);
            this.sandbox.stub(TenantDAO, "get").resolves(tenantModel);
            this.sandbox.stub(Utils, "getUserId").resolves(req.params.userId);
            this.sandbox.stub(SubProjectDAO, "get").resolves(subProjectModel);
            this.sandbox.stub(AuthProviderFactory, "build").returns(iAuthProvider);
            this.sandbox.stub(Promise, "all").resolves([false]);
            await Handler.handler(req, res, op);
            Tx.check403(res.statusCode, done)

        } );

        Tx.testExp(async (done: any, req: expRequest, res: expResponse, op: ImpersonationTokenOps) => {

            op = ImpersonationTokenOps.Generate;

            req.headers['user-token'] = "Bearer user-token";
            req.params.userId = "userId";

            req.body = {};
            req.body.resources = "resources";
            req.body.metadata = "metadata";

            impersonationTokenRequestBodyModel.resources[0].readonly = true;

            this.sandbox.stub(Auth, 'isImpersonationToken').returns(false);
            this.sandbox.stub(Auth, 'isAppAuthorized').resolves(true);
            this.sandbox.stub(Auth, 'isWriteAuthorized').resolves(true);
            this.sandbox.stub(Auth, 'isReadAuthorized').resolves(true);
            this.sandbox.stub(ImpersonationTokenParser, "generate").resolves(impersonationTokenRequestBodyModel);
            this.sandbox.stub(TenantDAO, "get").resolves(tenantModel);
            this.sandbox.stub(Utils, "getUserId").resolves(req.params.userId);
            this.sandbox.stub(SubProjectDAO, "get").resolves(subProjectModel);
            this.sandbox.stub(AuthProviderFactory, "build").returns(iAuthProvider);
            await Handler.handler(req, res, op);
            impersonationTokenRequestBodyModel.resources[0].readonly = false;
            Tx.check200(res.statusCode, done)

        } );

        Tx.testExp(async (done: any, req: expRequest, res: expResponse, op: ImpersonationTokenOps) => {

            op = ImpersonationTokenOps.Generate;

            req.headers['user-token'] = "Bearer user-token";
            req.params.userId = "userId";

            req.body = {};
            req.body.resources = "resources";
            req.body.metadata = "metadata";

            this.sandbox.stub(Auth, 'isImpersonationToken').returns(false);
            this.sandbox.stub(Auth, 'isAppAuthorized').throws();
            this.sandbox.stub(Auth, 'isWriteAuthorized').resolves(true);
            this.sandbox.stub(Auth, 'isReadAuthorized').resolves(true);
            this.sandbox.stub(ImpersonationTokenParser, "generate").resolves(impersonationTokenRequestBodyModel);
            this.sandbox.stub(TenantDAO, "get").resolves(tenantModel);
            this.sandbox.stub(Utils, "getUserId").resolves(req.params.userId);
            this.sandbox.stub(SubProjectDAO, "get").resolves(subProjectModel);
            this.sandbox.stub(AuthProviderFactory, "build").returns(iAuthProvider);
            await Handler.handler(req, res, op);
            Tx.check500(res.statusCode, done);

        } );

        Tx.testExp(async (done: any, req: expRequest, res: expResponse, op: ImpersonationTokenOps) => {

            op = ImpersonationTokenOps.Generate;

            req.headers['user-token'] = "Bearer user-token";
            req.params.userId = "userId";

            req.body = {};
            req.body.resources = "resources";
            req.body.metadata = "metadata";

            this.sandbox.stub(Auth, 'isImpersonationToken').returns(false);
            this.sandbox.stub(Auth, 'isAppAuthorized').resolves(true);
            this.sandbox.stub(Auth, 'isWriteAuthorized').resolves(true);
            this.sandbox.stub(Auth, 'isReadAuthorized').resolves(true);
            this.sandbox.stub(ImpersonationTokenParser, "generate").resolves(impersonationTokenRequestBodyModel);
            this.sandbox.stub(TenantDAO, "get").resolves(tenantModel);
            this.sandbox.stub(Utils, "getUserId").resolves(req.params.userId);
            this.sandbox.stub(SubProjectDAO, "get").resolves(subProjectModel);
            this.sandbox.stub(AuthProviderFactory, "build").returns(iAuthProvider);
            this.sandbox.stub(FeatureFlags, "isEnabled").returns(false);
            await Handler.handler(req, res, op);
            Tx.check200(res.statusCode, done);

        } );
        
    };

    private static refreshImpersonationTokenTest(tenantModel: ITenantModel, iAuthProvider: IAuthProvider) {

        Tx.sectionInit("refreshImpersonationTokenTest");

        Tx.testExp(async (done: any, req: expRequest, res: expResponse, op: ImpersonationTokenOps) => {

            op = ImpersonationTokenOps.Refresh;

            req.headers['impersonation-token'] = "impersonation-token";
            req.headers['impersonation-token-context'] = "impersonation-token.impersonation-token-context";

            this.sandbox.stub(Auth, 'isImpersonationToken').returns(false);
            this.sandbox.stub(Auth, 'isAppAuthorized').resolves(true);
            this.sandbox.stub(TenantDAO, "get").resolves(tenantModel);
            this.sandbox.stub(AuthProviderFactory, "build").returns(iAuthProvider);
            this.sandbox.stub(Utils, "decrypt").returns('{"resources":[{"resource": "name/resource", "readonly": false}], "metadata":{}, "user": "user", "impersonated_by": "impersonation-token"}');
            await Handler.handler(req, res, op);
            Tx.check200(res.statusCode, done);

        } );

        Tx.testExp(async (done: any, req: expRequest, res: expResponse, op: ImpersonationTokenOps) => {

            op = ImpersonationTokenOps.Refresh;

            req.headers['impersonation-token'] = "impersonation-token";
            req.headers['impersonation-token-context'] = "impersonation-token.impersonation-token-context";


            this.sandbox.stub(Auth, 'isImpersonationToken').returns(false);
            this.sandbox.stub(Auth, 'isAppAuthorized').throws();
            this.sandbox.stub(TenantDAO, "get").resolves(tenantModel);
            this.sandbox.stub(AuthProviderFactory, "build").returns(iAuthProvider);
            this.sandbox.stub(Utils, "decrypt").returns('{"resources":[{"resource": "name/resource", "readonly": false}], "metadata":{}, "user": "user", "impersonated_by": "impersonation-token"}');
            await Handler.handler(req, res, op);
            Tx.check500(res.statusCode, done);

        } );

        Tx.testExp(async (done: any, req: expRequest, res: expResponse, op: ImpersonationTokenOps) => {

            op = ImpersonationTokenOps.Refresh;

            req.headers['impersonation-token'] = "impersonation-token";
            req.headers['impersonation-token-context'] = "impersonation-token.impersonation-token-context.xx";


            this.sandbox.stub(Auth, 'isImpersonationToken').returns(false);
            await Handler.handler(req, res, op);
            Tx.check400(res.statusCode, done);

        } );

        Tx.testExp(async (done: any, req: expRequest, res: expResponse, op: ImpersonationTokenOps) => {

            op = ImpersonationTokenOps.Refresh;

            req.headers['impersonation-token'] = "impersonation-token";


            this.sandbox.stub(Auth, 'isImpersonationToken').returns(false);
            await Handler.handler(req, res, op);
            Tx.check400(res.statusCode, done);

        } );

        Tx.testExp(async (done: any, req: expRequest, res: expResponse, op: ImpersonationTokenOps) => {

            op = ImpersonationTokenOps.Refresh;

            req.headers['impersonation-token-context'] = "impersonation-token.impersonation-token-context";


            this.sandbox.stub(Auth, 'isImpersonationToken').returns(false);
            await Handler.handler(req, res, op);
            Tx.check400(res.statusCode, done);

        } );

        Tx.testExp(async (done: any, req: expRequest, res: expResponse, op: ImpersonationTokenOps) => {

            op = ImpersonationTokenOps.Refresh;

            req.headers['impersonation-token'] = "impersonation-token";
            req.headers['impersonation-token-context'] = "impersonation-token.impersonation-token-context";

            this.sandbox.stub(Auth, 'isImpersonationToken').returns(false);
            this.sandbox.stub(Auth, 'isAppAuthorized').resolves(true);
            this.sandbox.stub(TenantDAO, "get").resolves(tenantModel);
            this.sandbox.stub(AuthProviderFactory, "build").returns(iAuthProvider);
            this.sandbox.stub(Utils, "decrypt").returns('{"resources":[{"resource": "name/resource", "readonly": false}], "metadata":{}, "user": "user", "impersonated_by": "impersonation-token"}');
            this.sandbox.stub(FeatureFlags, "isEnabled").returns(false);
            await Handler.handler(req, res, op);
            Tx.check200(res.statusCode, done);

        } );
        
    };

    private static errorTokenTest() {

        Tx.sectionInit("errorTokenTest");

        Tx.testExp(async (done: any, req: expRequest, res: expResponse, op: ImpersonationTokenOps) => {

            op = 5;

            this.sandbox.stub(Auth, 'isImpersonationToken').returns(false);
            await Handler.handler(req, res, op);
            Tx.check500(res.statusCode, done);

        } );

        Tx.testExp(async (done: any, req: expRequest, res: expResponse, op: ImpersonationTokenOps) => {

            this.sandbox.stub(Auth, 'isImpersonationToken').returns(true);
            await Handler.handler(req, res, op);
            Tx.check403(res.statusCode, done);

        } );
        
    };

};