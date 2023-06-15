import sinon from 'sinon';
import { Request as expRequest, Response as expResponse } from 'express';
import { Auth, AuthGroups } from '../../../../src/auth';
import { IDESEntitlementGroupModel } from '../../../../src/cloud/dataecosystem';
import { DatasetDAO, DatasetModel } from '../../../../src/services/dataset';
import { SubProjectDAO, SubProjectModel } from '../../../../src/services/subproject';
import { TenantDAO } from '../../../../src/services/tenant';
import { ITenantModel } from '../../../../src/services/tenant/model';
import { UserOP } from '../../../../src/services/user/optype';
import { UserHandler as Handler } from '../../../../src/services/user/handler';
import { Tx } from '../../utils';
import { SubprojectAuth } from '../../../../src/services/subproject';
export class TestServicesUserHandler {

    private static sandbox: sinon.SinonSandbox;
    

    public static run() {

        describe(Tx.testInit("User/Handler"), () => {
            this.sandbox = sinon.createSandbox();
            let tenantModel: ITenantModel = {
                name: "tenant",
                esd: "esd",
                gcpid: '',
                default_acls: ''
            };
            let subProjectModel: SubProjectModel = {
                name: '',
                tenant: '',
                admin: '',
                storage_class: '',
                storage_location: '',
                ltag: '',
                gcs_bucket: '',
                enforce_key: false,
                access_policy: ""
            };
            let datasetModel: DatasetModel = {
                name: '',
                tenant: '',
                subproject: '',
                path: '',
                created_date: '',
                last_modified_date: '',
                created_by: '',
                metadata: undefined,
                filemetadata: undefined,
                gcsurl: '',
                type: '',
                ltag: '',
                ctag: '',
                sbit: '',
                sbit_count: 0,
                gtags: [],
                readonly: false,
                seismicmeta_guid: '',
                transfer_status: '',
                acls: { admins: [], viewers: [] },
                access_policy: ''
            };
            let iDESEntitlementGroupModel: IDESEntitlementGroupModel[] = [
                {name: 'name', description: 'description', email: 'test@123emal.com'}
            ];
            let subProjectModelArr: SubProjectModel[] = [
                {
                    name: '',
                    tenant: '',
                    admin: '',
                    storage_class: '',
                    storage_location: '',
                    ltag: '',
                    gcs_bucket: '',
                    enforce_key: false,
                    acls: { admins: [], viewers: [] },
                    access_policy: ""
                }
            ];
            beforeEach(() => {

                subProjectModel.access_policy = "dataset";
                subProjectModel.enforce_key = false;
                datasetModel.acls = { admins: [], viewers: [] };
            } );

            afterEach(() => { this.sandbox.restore(); });

            this.addUserToGroupsTest(tenantModel, subProjectModel, datasetModel);
            this.removeUserFromDatasetTest(tenantModel, subProjectModel, datasetModel);
            this.listUsersTest(tenantModel, subProjectModel, datasetModel);
            this.rolesUserTest(tenantModel, subProjectModel, datasetModel, iDESEntitlementGroupModel, subProjectModelArr);
            this.errorTest();
        } );
    };

    private static addUserToGroupsTest(tenantModel: ITenantModel, subProjectModel: SubProjectModel, datasetModel: DatasetModel) {

        Tx.sectionInit("addUserToGroupsTest");

        Tx.testExp(async (done: any, req: expRequest, res: expResponse, op: UserOP) => {
            
            op = UserOP.Add;

            req.body = {};
            req.body.path = "sd://tenant/subproject/path/mydata.txt";
            req.body.email = "test@123.com";
            req.body.group = "viewer";

            //
            subProjectModel.access_policy = "dataset";
            //

            this.sandbox.stub(Auth, 'isImpersonationToken').returns(false);
            this.sandbox.stub(TenantDAO, 'get').resolves(tenantModel);
            this.sandbox.stub(SubProjectDAO, 'get').resolves(subProjectModel);
            this.sandbox.stub(DatasetDAO, 'get').resolves([datasetModel, undefined]);

            await Handler.handler(req, res, op);
            Tx.check200(res.statusCode, done)
        });

        Tx.testExp(async (done: any, req: expRequest, res: expResponse, op: UserOP) => {
            
            op = UserOP.Add;

            req.body = {};
            req.body.path = "sd://tenant/subproject/path/mydata.txt";
            req.body.email = "test@123.com";
            req.body.group = "viewer";

            //
            datasetModel.acls = undefined;
            //

            this.sandbox.stub(Auth, 'isImpersonationToken').returns(false);
            this.sandbox.stub(TenantDAO, 'get').resolves(tenantModel);
            this.sandbox.stub(SubProjectDAO, 'get').resolves(subProjectModel);
            this.sandbox.stub(DatasetDAO, 'get').resolves([datasetModel, undefined]);

            await Handler.handler(req, res, op);
            Tx.check400(res.statusCode, done)
        });

        Tx.testExp(async (done: any, req: expRequest, res: expResponse, op: UserOP) => {
            
            op = UserOP.Add;

            req.body = {};
            req.body.path = "sd://tenant/subproject/path/mydata.txt";
            req.body.email = "test@123.com";
            req.body.group = "admin";

            //
            //

            this.sandbox.stub(Auth, 'isImpersonationToken').returns(false);
            this.sandbox.stub(TenantDAO, 'get').resolves(tenantModel);
            this.sandbox.stub(SubProjectDAO, 'get').resolves(subProjectModel);
            this.sandbox.stub(DatasetDAO, 'get').resolves([datasetModel, undefined]);

            await Handler.handler(req, res, op);
            Tx.check200(res.statusCode, done)
        });

        Tx.testExp(async (done: any, req: expRequest, res: expResponse, op: UserOP) => {
            
            op = UserOP.Add;

            req.body = {};
            req.body.path = "sd://tenant/subproject/path/mydata.txt";
            req.body.email = "test@123.com";
            req.body.group = "admin";

            //
            datasetModel.acls = undefined;
            //

            this.sandbox.stub(Auth, 'isImpersonationToken').returns(false);
            this.sandbox.stub(TenantDAO, 'get').resolves(tenantModel);
            this.sandbox.stub(SubProjectDAO, 'get').resolves(subProjectModel);
            this.sandbox.stub(DatasetDAO, 'get').resolves([datasetModel, undefined]);

            await Handler.handler(req, res, op);
            Tx.check400(res.statusCode, done)
        });

        Tx.testExp(async (done: any, req: expRequest, res: expResponse, op: UserOP) => {
            
            op = UserOP.Add;

            req.body = {};
            req.body.path = "sd://tenant/subproject/path/mydata.txt";
            req.body.email = "test@123.com";
            req.body.group = "admin";

            //
            subProjectModel.enforce_key = true;
            //

            this.sandbox.stub(Auth, 'isImpersonationToken').returns(false);
            this.sandbox.stub(TenantDAO, 'get').resolves(tenantModel);
            this.sandbox.stub(SubProjectDAO, 'get').resolves(subProjectModel);
            this.sandbox.stub(DatasetDAO, 'getByKey').resolves(datasetModel);

            await Handler.handler(req, res, op);
            Tx.check200(res.statusCode, done)
        });

        Tx.testExp(async (done: any, req: expRequest, res: expResponse, op: UserOP) => {
            
            op = UserOP.Add;

            req.body = {};
            req.body.path = "sd://tenant/subproject/path/mydata.txt";
            req.body.email = "test@123.com";
            req.body.group = "admin";

            //
            subProjectModel.access_policy = "uniform";
            //

            this.sandbox.stub(Auth, 'isImpersonationToken').returns(false);
            this.sandbox.stub(TenantDAO, 'get').resolves(tenantModel);
            this.sandbox.stub(SubProjectDAO, 'get').resolves(subProjectModel);

            await Handler.handler(req, res, op);
            Tx.check400(res.statusCode, done)
        });

    };

    private static removeUserFromDatasetTest(tenantModel: ITenantModel, subProjectModel: SubProjectModel, datasetModel: DatasetModel) {

        Tx.sectionInit("removeUserFromDatasetTest");

        Tx.testExp(async (done: any, req: expRequest, res: expResponse, op: UserOP) => {
            
            op = UserOP.Remove;

            req.query = {};
            req.query.path = "sd://tenant/subproject/path/mydata.txt";
            req.query.email = "test@123.com";

            //
            //

            this.sandbox.stub(Auth, 'isImpersonationToken').returns(false);
            this.sandbox.stub(TenantDAO, 'get').resolves(tenantModel);
            this.sandbox.stub(SubProjectDAO, 'get').resolves(subProjectModel);
            this.sandbox.stub(SubprojectAuth, 'getAuthGroups').returns(['test']);
            this.sandbox.stub(Auth, 'isUserAuthorized').resolves(true);
            this.sandbox.stub(DatasetDAO, 'get').resolves([datasetModel, undefined]);

            await Handler.handler(req, res, op);
            Tx.check200(res.statusCode, done)
        });

        Tx.testExp(async (done: any, req: expRequest, res: expResponse, op: UserOP) => {
            
            op = UserOP.Remove;

            req.query = {};
            req.query.path = "sd://tenant/subproject/path/mydata.txt";
            req.query.email = "test@123.com";

            //
            datasetModel.acls = undefined;
            //

            this.sandbox.stub(Auth, 'isImpersonationToken').returns(false);
            this.sandbox.stub(TenantDAO, 'get').resolves(tenantModel);
            this.sandbox.stub(SubProjectDAO, 'get').resolves(subProjectModel);
            this.sandbox.stub(SubprojectAuth, 'getAuthGroups').returns(['test']);
            this.sandbox.stub(Auth, 'isUserAuthorized').resolves(true);
            this.sandbox.stub(DatasetDAO, 'get').resolves([datasetModel, undefined]);

            await Handler.handler(req, res, op);
            Tx.check200(res.statusCode, done)
        });

        Tx.testExp(async (done: any, req: expRequest, res: expResponse, op: UserOP) => {
            
            op = UserOP.Remove;

            req.query = {};
            req.query.path = "sd://tenant/subproject/path/mydata.txt";
            req.query.email = "test@123.com";

            //
            subProjectModel.enforce_key = true;
            //

            this.sandbox.stub(Auth, 'isImpersonationToken').returns(false);
            this.sandbox.stub(TenantDAO, 'get').resolves(tenantModel);
            this.sandbox.stub(SubProjectDAO, 'get').resolves(subProjectModel);
            this.sandbox.stub(SubprojectAuth, 'getAuthGroups').returns(['test']);
            this.sandbox.stub(Auth, 'isUserAuthorized').resolves(true);
            this.sandbox.stub(DatasetDAO, 'getByKey').resolves(datasetModel);

            await Handler.handler(req, res, op);
            Tx.check200(res.statusCode, done)
        });
    };

    private static listUsersTest(tenantModel: ITenantModel, subProjectModel: SubProjectModel, datasetModel: DatasetModel) {

        Tx.sectionInit("listUsersTest");

        Tx.testExp(async (done: any, req: expRequest, res: expResponse, op: UserOP) => {
            
            op = UserOP.List;

            req.query = {};
            req.query.sdpath = "sd://tenant/subproject/path";

            //
            datasetModel.acls = undefined;
            //

            this.sandbox.stub(Auth, 'isImpersonationToken').returns(false);
            this.sandbox.stub(TenantDAO, 'get').resolves(tenantModel);
            this.sandbox.stub(SubProjectDAO, 'get').resolves(subProjectModel);
            this.sandbox.stub(DatasetDAO, 'get').resolves([datasetModel, undefined]);

            await Handler.handler(req, res, op);
            Tx.check200(res.statusCode, done)
        });

        Tx.testExp(async (done: any, req: expRequest, res: expResponse, op: UserOP) => {
            
            op = UserOP.List;

            req.query = {};
            req.query.sdpath = "sd://tenant/subproject";

            //
            subProjectModel.acls  = { admins: [], viewers: [] };
            //

            this.sandbox.stub(Auth, 'isImpersonationToken').returns(false);
            this.sandbox.stub(TenantDAO, 'get').resolves(tenantModel);
            this.sandbox.stub(SubProjectDAO, 'get').resolves(subProjectModel);

            await Handler.handler(req, res, op);
            Tx.check200(res.statusCode, done)
        });

        Tx.testExp(async (done: any, req: expRequest, res: expResponse, op: UserOP) => {
            
            op = UserOP.List;

            req.query = {};
            req.query.sdpath = "sd://tenant/subproject/path";

            //
            //

            this.sandbox.stub(Auth, 'isImpersonationToken').returns(false);
            this.sandbox.stub(TenantDAO, 'get').resolves(tenantModel);
            this.sandbox.stub(SubProjectDAO, 'get').resolves(subProjectModel);
            this.sandbox.stub(DatasetDAO, 'get').resolves([datasetModel, undefined]);

            await Handler.handler(req, res, op);
            Tx.check200(res.statusCode, done)
        });

        Tx.testExp(async (done: any, req: expRequest, res: expResponse, op: UserOP) => {
            
            op = UserOP.List;

            req.query = {};
            req.query.sdpath = "sd://tenant/subproject/path";

            //
            subProjectModel.enforce_key = true;
            //

            this.sandbox.stub(Auth, 'isImpersonationToken').returns(false);
            this.sandbox.stub(TenantDAO, 'get').resolves(tenantModel);
            this.sandbox.stub(SubProjectDAO, 'get').resolves(subProjectModel);
            this.sandbox.stub(DatasetDAO, 'getByKey').resolves(datasetModel);

            await Handler.handler(req, res, op);
            Tx.check200(res.statusCode, done)
        });

        Tx.testExp(async (done: any, req: expRequest, res: expResponse, op: UserOP) => {
            
            op = UserOP.List;

            req.query = {};
            req.query.sdpath = "sd://tenant/";

            //
            subProjectModel.enforce_key = true;
            //

            this.sandbox.stub(Auth, 'isImpersonationToken').returns(false);

            await Handler.handler(req, res, op);
            Tx.check400(res.statusCode, done)
        });
    };

    private static rolesUserTest(tenantModel: ITenantModel, subProjectModel: SubProjectModel, datasetModel: DatasetModel, iDESEntitlementGroupModel: IDESEntitlementGroupModel[], subProjectModelArr: SubProjectModel[]) {

        Tx.sectionInit("rolesUserTest");

        Tx.testExp(async (done: any, req: expRequest, res: expResponse, op: UserOP) => {
            
            op = UserOP.Roles;

            req.query = {};
            req.query.sdpath = "sd://tenant/subproject";
            req.query.email = "test@123.com";
            req.query.group = "admin";

            //
            //

            this.sandbox.stub(Auth, 'isImpersonationToken').returns(false);
            this.sandbox.stub(Auth, 'isUserRegistered').resolves();
            this.sandbox.stub(AuthGroups, 'getUserGroups').resolves(iDESEntitlementGroupModel);
            this.sandbox.stub(TenantDAO, 'get').resolves(tenantModel);
            this.sandbox.stub(SubProjectDAO, 'get').resolves(subProjectModel);
            this.sandbox.stub(SubProjectDAO, 'list').resolves(subProjectModelArr);
            this.sandbox.stub(DatasetDAO, 'get').resolves([datasetModel, undefined]);

            await Handler.handler(req, res, op);
            Tx.check200(res.statusCode, done)
        });

        Tx.testExp(async (done: any, req: expRequest, res: expResponse, op: UserOP) => {
            
            op = UserOP.Roles;

            req.query = {};
            req.query.sdpath = "sd://tenant/";
            req.query.email = "test@123.com";
            req.query.group = "admin";

            //
            //

            this.sandbox.stub(Auth, 'isImpersonationToken').returns(false);
            this.sandbox.stub(Auth, 'isUserRegistered').resolves();
            this.sandbox.stub(AuthGroups, 'getUserGroups').resolves(iDESEntitlementGroupModel);
            this.sandbox.stub(TenantDAO, 'get').resolves(tenantModel);
            this.sandbox.stub(SubProjectDAO, 'get').resolves(subProjectModel);
            this.sandbox.stub(SubProjectDAO, 'list').resolves(subProjectModelArr);
            this.sandbox.stub(DatasetDAO, 'get').resolves([datasetModel, undefined]);

            await Handler.handler(req, res, op);
            Tx.check200(res.statusCode, done)
        });

        Tx.testExp(async (done: any, req: expRequest, res: expResponse, op: UserOP) => {
            
            op = UserOP.Roles;

            req.query = {};
            req.query.sdpath = "sd://tenant/subproject/path";
            req.query.email = "test@123.com";
            req.query.group = "admin";

            //
            //

            this.sandbox.stub(Auth, 'isImpersonationToken').returns(false);
            this.sandbox.stub(Auth, 'isUserRegistered').resolves();
            this.sandbox.stub(AuthGroups, 'getUserGroups').resolves(iDESEntitlementGroupModel);
            this.sandbox.stub(TenantDAO, 'get').resolves(tenantModel);
            this.sandbox.stub(SubProjectDAO, 'get').resolves(subProjectModel);
            this.sandbox.stub(SubProjectDAO, 'list').resolves(subProjectModelArr);
            this.sandbox.stub(DatasetDAO, 'get').resolves([datasetModel, undefined]);

            await Handler.handler(req, res, op);
            Tx.check200(res.statusCode, done)
        });

        Tx.testExp(async (done: any, req: expRequest, res: expResponse, op: UserOP) => {
            
            op = UserOP.Roles;

            req.query = {};
            req.query.sdpath = "sd://tenant/subproject/path";
            req.query.email = "test@123.com";
            req.query.group = "admin";

            //
            datasetModel.acls = undefined;
            subProjectModel.enforce_key = true;
            //

            this.sandbox.stub(Auth, 'isImpersonationToken').returns(false);
            this.sandbox.stub(Auth, 'isUserRegistered').resolves();
            this.sandbox.stub(AuthGroups, 'getUserGroups').resolves(iDESEntitlementGroupModel);
            this.sandbox.stub(TenantDAO, 'get').resolves(tenantModel);
            this.sandbox.stub(SubProjectDAO, 'get').resolves(subProjectModel);
            this.sandbox.stub(SubProjectDAO, 'list').resolves(subProjectModelArr);
            this.sandbox.stub(DatasetDAO, 'getByKey').resolves(datasetModel);

            await Handler.handler(req, res, op);
            Tx.check200(res.statusCode, done)
        });

        Tx.testExp(async (done: any, req: expRequest, res: expResponse, op: UserOP) => {
            
            op = UserOP.Roles;

            req.query = {};
            req.query.sdpath = "sd://";
            req.query.email = "test@123.com";
            req.query.group = "admin";

            //
            //

            this.sandbox.stub(Auth, 'isImpersonationToken').returns(false);

            await Handler.handler(req, res, op);
            Tx.check400(res.statusCode, done)
        });

        Tx.testExp(async (done: any, req: expRequest, res: expResponse, op: UserOP) => {
            
            op = UserOP.Roles;

            req.query = {};
            req.query.sdpath = "/";

            this.sandbox.stub(Auth, 'isImpersonationToken').returns(false);

            await Handler.handler(req, res, op);
            Tx.check400(res.statusCode, done)
        });

    };

    private static errorTest() {

        Tx.sectionInit("errorTest");

        Tx.testExp(async (done: any, req: expRequest, res: expResponse, op: UserOP) => {
            
            op = 5;

            this.sandbox.stub(Auth, 'isImpersonationToken').returns(false);

            await Handler.handler(req, res, op);
            Tx.check500(res.statusCode, done)
        });

        Tx.testExp(async (done: any, req: expRequest, res: expResponse, op: UserOP) => {

            this.sandbox.stub(Auth, 'isImpersonationToken').returns(true);

            await Handler.handler(req, res, op);
            Tx.check403(res.statusCode, done)
        });

    };

};