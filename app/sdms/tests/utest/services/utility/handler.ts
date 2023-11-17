import sinon from 'sinon';
import Bull from 'bull';
import { Request as expRequest, Response as expResponse } from 'express';
import { Auth, AuthRoles } from '../../../../src/auth';
import { Config, CredentialsFactory, JournalFactoryTenantClient, StorageFactory } from '../../../../src/cloud';
import { IAccessTokenModel, ICredentials, } from '../../../../src/cloud/credentials';
import { IDESEntitlementGroupModel } from '../../../../src/cloud/dataecosystem';
import { SeistoreFactory } from '../../../../src/cloud/seistore';
import { StorageJobManager } from '../../../../src/cloud/shared/queue';
import { DESEntitlement, DESStorage, DESUtils } from '../../../../src/dataecosystem';
import { Error, Feature, FeatureFlags, Response, Utils } from '../../../../src/shared';
import { DatasetAuth, DatasetDAO, DatasetModel, DatasetUtils } from '../../../../src/services/dataset';
import { IWriteLockSession, Locker } from '../../../../src/services/dataset/locker';
import { SubprojectAuth, SubProjectDAO, SubProjectModel } from '../../../../src/services/subproject';
import { TenantDAO } from '../../../../src/services/tenant';
import { ITenantModel } from '../../../../src/services/tenant/model';
import { UtilityOP } from '../../../../src/services/utility/optype';
import { UtilityParser } from '../../../../src/services/utility/parser';
import { UtilityHandler as Handler } from '../../../../src/services/utility/handler';
import { Tx } from '../../utils';

export class TestServicesUtilityHandler {

    private static sandbox: sinon.SinonSandbox;

    public static run() {

        describe(Tx.testInit("Utility/Handler"), () => {

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
                gcsurl: 'gcsurl0/gcsurl1',
                type: '',
                ltag: '',
                ctag: '',
                sbit: '',
                sbit_count: 0,
                gtags: [],
                readonly: false,
                seismicmeta_guid: 'seismicmeta_guid:seismicmeta_guid',
                transfer_status: '',
                acls: { admins: [], viewers: [] },
                access_policy: ''
            };
            let iAccessTokenModel: IAccessTokenModel = {
                access_token: '',
                expires_in: 0,
                token_type: ''
            };
            let iCredentials: ICredentials = {
                getStorageCredentials: function (tenant: string, subproject: string, bucket: string, readonly: boolean, partitionID: string, objectPrefix?: string | undefined): Promise<IAccessTokenModel> {
                    return Promise.resolve(iAccessTokenModel);
                },
                getServiceAccountAccessToken: function (): Promise<IAccessTokenModel> {
                    throw new Error();
                },
                getIAMResourceUrl: function (serviceSigner: string): string {
                    throw new Error();
                },
                getAudienceForImpCredentials: function (): string {
                    throw new Error();
                },
                getPublicKeyCertificatesUrl: function (): string {
                    throw new Error();
                },
                getUserId: function(userToken: string): Promise<string> {
                    throw new Error();
                } 
            };
            beforeEach(() => {
                this.sandbox.define(Config, 'CLOUDPROVIDER', 'google');
                subProjectModel.access_policy = "dataset";
                subProjectModel.enforce_key = false;
                datasetModel.transfer_status = '';
             });
            afterEach(() => { this.sandbox.restore(); });

            this.getGCSAccessTokenTest(tenantModel, subProjectModel, datasetModel, iCredentials);
            this.lsTest(tenantModel, subProjectModel, datasetModel);
            this.cpTest(tenantModel, subProjectModel, datasetModel);
            this.getConnectionStringTest(tenantModel, subProjectModel, datasetModel, iCredentials);
            this.listStorageTiersTest();
            this.errorTest();

        } );
    };

    private static getGCSAccessTokenTest(tenantModel: ITenantModel, subProjectModel: SubProjectModel, datasetModel: DatasetModel, iCredentials: ICredentials) {

        Tx.sectionInit("getGCSAccessTokenTest");

        Tx.testExpAsync(async (req: expRequest, res: expResponse, op: UtilityOP) => {

            op = UtilityOP.GCSTOKEN;

            req.query = {};
            req.query.sdpath = "sd://tenant/subproject/path/mydata.txt";
            req.query.readonly = "false";

            //
            subProjectModel.access_policy = "dataset";
            //

            this.sandbox.stub(Auth, 'isWriteAuthorized').resolves(true);
            this.sandbox.stub(TenantDAO, 'get').resolves(tenantModel);
            this.sandbox.stub(SubProjectDAO, 'get').resolves(subProjectModel);
            this.sandbox.stub(DatasetDAO, 'get').resolves([datasetModel, undefined]);
            this.sandbox.stub(CredentialsFactory, "build").returns(iCredentials);

            await Handler.handler(req, res, op);
            Tx.check200(res.statusCode)

        } );

        Tx.testExpAsync(async (req: expRequest, res: expResponse, op: UtilityOP) => {

            op = UtilityOP.GCSTOKEN;

            req.query = {};
            req.query.sdpath = "sd://tenant/subproject/path/mydata.txt";
            req.query.readonly = "true";

            //
            subProjectModel.access_policy = "dataset";
            //

            this.sandbox.stub(Auth, 'isReadAuthorized').resolves(true);
            this.sandbox.stub(TenantDAO, 'get').resolves(tenantModel);
            this.sandbox.stub(SubProjectDAO, 'get').resolves(subProjectModel);
            this.sandbox.stub(DatasetDAO, 'get').resolves([datasetModel, undefined]);
            this.sandbox.stub(CredentialsFactory, "build").returns(iCredentials);

            await Handler.handler(req, res, op);
            Tx.check200(res.statusCode)

        } );

        Tx.testExpAsync(async (req: expRequest, res: expResponse, op: UtilityOP) => {

            op = UtilityOP.GCSTOKEN;

            req.query = {};
            req.query.sdpath = "sd://tenant/subproject/path/mydata.txt";
            req.query.readonly = "false";

            //
            subProjectModel.enforce_key = true;
            //

            this.sandbox.stub(Auth, 'isWriteAuthorized').resolves(true);
            this.sandbox.stub(TenantDAO, 'get').resolves(tenantModel);
            this.sandbox.stub(SubProjectDAO, 'get').resolves(subProjectModel);
            this.sandbox.stub(DatasetDAO, 'getByKey').resolves(datasetModel);
            this.sandbox.stub(CredentialsFactory, "build").returns(iCredentials);

            await Handler.handler(req, res, op);
            Tx.check200(res.statusCode)

        } );

        Tx.testExpAsync(async (req: expRequest, res: expResponse, op: UtilityOP) => {

            op = UtilityOP.GCSTOKEN;

            req.query = {};
            req.query.sdpath = "sd://tenant/subproject/path/mydata.txt";
            req.query.readonly = "false";

            //
            //

            this.sandbox.stub(Auth, 'isWriteAuthorized').resolves(true);
            this.sandbox.stub(TenantDAO, 'get').resolves(tenantModel);
            this.sandbox.stub(SubProjectDAO, 'get').resolves(subProjectModel);
            this.sandbox.stub(DatasetDAO, 'get').resolves([datasetModel, undefined]);
            this.sandbox.stub(CredentialsFactory, "build").returns(iCredentials);

            await Handler.handler(req, res, op);
            Tx.check200(res.statusCode)

        } );
        
    };

    private static lsTest(tenantModel: ITenantModel, subProjectModel: SubProjectModel, datasetModel: DatasetModel) {

        Tx.sectionInit("lsTest");

        Tx.testExpAsync(async (req: expRequest, res: expResponse, op: UtilityOP) => {

            op = UtilityOP.LS;

            req.query = {};
            req.query.sdpath = "sd://tenant/subproject/path/mydata.txt";
            req.query.wmode = "all";
            req.query.limit = "100";
            req.query.cursor = "cursor";
            
            this.sandbox.stub(Auth, 'isReadAuthorized').resolves(true);
            this.sandbox.stub(TenantDAO, 'get').resolves(tenantModel);
            this.sandbox.stub(SubProjectDAO, 'get').resolves(subProjectModel);
            this.sandbox.stub(DatasetDAO, 'get').resolves([datasetModel, undefined]);
            this.sandbox.stub(DatasetDAO, "paginatedListContent").resolves({ datasets: [""], nextPageCursor: "" } );

            await Handler.handler(req, res, op);
            Tx.check200(res.statusCode)

        } );

        Tx.testExpAsync(async (req: expRequest, res: expResponse, op: UtilityOP) => {

            op = UtilityOP.LS;

            req.query = {};
            req.query.sdpath = "sd://tenant/";
            req.query.wmode = "all";
            req.query.limit = "100";
            req.query.cursor = "cursor";
            
            //
            let iDESEntitlementGroupModel: IDESEntitlementGroupModel = {
                name: 'name',
                description: 'description',
                email: 'test@123@email.com'
            };
            //

            this.sandbox.stub(TenantDAO, 'get').resolves(tenantModel);
            this.sandbox.stub(SubProjectDAO, 'list').resolves([subProjectModel]);
            this.sandbox.stub(DESEntitlement, "getUserGroups").resolves([iDESEntitlementGroupModel]);

            await Handler.handler(req, res, op);
            Tx.check200(res.statusCode)

        } );

        Tx.testExpAsync(async (req: expRequest, res: expResponse, op: UtilityOP) => {

            op = UtilityOP.LS;

            req.query = {};
            req.query.sdpath = "sd://tenant/subproject";
            req.query.wmode = "all";
            req.query.limit = "100";
            req.query.cursor = "cursor";
            
            let iDESEntitlementGroupModel: IDESEntitlementGroupModel = {
                name: 'name',
                description: 'description',
                email: 'test@123@email.com'
            };

            this.sandbox.stub(Auth, 'isReadAuthorized').resolves(true);
            this.sandbox.stub(TenantDAO, 'get').resolves(tenantModel);
            this.sandbox.stub(SubProjectDAO, 'get').resolves(subProjectModel);
            this.sandbox.stub(DESEntitlement, "getUserGroups").resolves([iDESEntitlementGroupModel]);

            const dataset = {} as DatasetModel;
            dataset.tenant = 'tenant';
            dataset.subproject = 'subproject';
            dataset.path = '/';

            this.sandbox.stub(DatasetDAO, "paginatedListContent")
            .withArgs(sinon.match.any)
            .throws(new Error())
            .withArgs(sinon.match.any, dataset, sinon.match.any, sinon.match.any )
            .resolves({ datasets: [""], nextPageCursor: "" } );

            await Handler.handler(req, res, op);
            Tx.check200(res.statusCode)

        } );

        Tx.testExpAsync(async (req: expRequest, res: expResponse, op: UtilityOP) => {

            op = UtilityOP.LS;

            req.query = {};
            req.query.sdpath = "sd://";
            req.query.wmode = "all";
            req.query.limit = "100";
            req.query.cursor = "cursor";

            this.sandbox.stub(TenantDAO, 'getAll').resolves([tenantModel]);

            await Handler.handler(req, res, op);
            Tx.check200(res.statusCode)

        } );

        Tx.testExpAsync(async (req: expRequest, res: expResponse, op: UtilityOP) => {

            op = UtilityOP.LS;

            req.query = {};
            req.query.sdpath = "sd://";
            req.query.wmode = "all";
            req.query.limit = "-2";
            req.query.cursor = "";

            await Handler.handler(req, res, op);
            Tx.check400(res.statusCode)

        } );

        Tx.testExpAsync(async (req: expRequest, res: expResponse, op: UtilityOP) => {

            op = UtilityOP.LS;

            req.query = {};
            req.query.sdpath = "sd://";
            req.query.wmode = "all";
            req.query.limit = "-2";
            req.query.cursor = "cursor";

            await Handler.handler(req, res, op);
            Tx.check400(res.statusCode)

        } );

        Tx.testExpAsync(async (req: expRequest, res: expResponse, op: UtilityOP) => {

            op = UtilityOP.LS;

            req.query = {};
            req.query.sdpath = "sd://";
            req.query.wmode = "wmode";
            req.query.limit = "100";
            req.query.cursor = "cursor";

            await Handler.handler(req, res, op);
            Tx.check400(res.statusCode)

        } );

        Tx.testExpAsync(async (req: expRequest, res: expResponse, op: UtilityOP) => {

            op = UtilityOP.LS;

            req.query = {};
            req.query.sdpath = "/";
            req.query.wmode = "all";
            req.query.limit = "100";
            req.query.cursor = "cursor";

            await Handler.handler(req, res, op);
            Tx.check400(res.statusCode)

        } );
        
    };

    private static cpTest(tenantModel: ITenantModel, subProjectModel: SubProjectModel, datasetModel: DatasetModel) {

        Tx.sectionInit("cpTest");

        Tx.testExpAsync(async (req: expRequest, res: expResponse, op: UtilityOP) => {

            op = UtilityOP.CP;

            req.query = {};
            req.query.sdpath_from = "sd://tenant/subproject/path/mydata.txt";
            req.query.sdpath_to = "sd://tenant/subproject/path2/";

            this.sandbox.stub(Auth, 'isWriteAuthorized').resolves(true);
            this.sandbox.stub(Auth, 'isReadAuthorized').resolves(true);
            this.sandbox.stub(TenantDAO, 'get').resolves(tenantModel);
            this.sandbox.stub(SubProjectDAO, 'get').resolves(subProjectModel);
            this.sandbox.stub(DatasetDAO, 'get').resolves([datasetModel, undefined]);
            this.sandbox.stub(DESStorage, 'getRecord').resolves({ id: "" });

            await Handler.handler(req, res, op);
            Tx.check200(res.statusCode)

        } );

        Tx.testExpAsync(async (req: expRequest, res: expResponse, op: UtilityOP) => {

            op = UtilityOP.CP;

            req.query = {};
            req.query.sdpath_from = "sd://tenant/subproject/path/mydata.txt";
            req.query.sdpath_to = "sd://tenant/subproject/path2/";

            //
            subProjectModel.enforce_key = true;
            //

            this.sandbox.stub(Auth, 'isWriteAuthorized').resolves(true);
            this.sandbox.stub(Auth, 'isReadAuthorized').resolves(true);
            this.sandbox.stub(TenantDAO, 'get').resolves(tenantModel);
            this.sandbox.stub(SubProjectDAO, 'get').resolves(subProjectModel);
            this.sandbox.stub(DatasetDAO, 'getByKey').resolves(datasetModel);
            this.sandbox.stub(Locker, "getLock").resolves("toDatasetLock");
            this.sandbox.stub(Locker, "isWriteLock").returns(true);
            this.sandbox.stub(DESStorage, 'getRecord').resolves({ id: "" });

            await Handler.handler(req, res, op);
            Tx.check400(res.statusCode)

        } );

        Tx.testExpAsync(async (req: expRequest, res: expResponse, op: UtilityOP) => {

            op = UtilityOP.CP;

            req.query = {};
            req.query.sdpath_from = "sd://tenant/subproject/path/mydata.txt";
            req.query.sdpath_to = "sd://tenant/subproject/path2/";

            //
            datasetModel.transfer_status = "InProgress";
            //

            this.sandbox.stub(Auth, 'isWriteAuthorized').resolves(true);
            this.sandbox.stub(Auth, 'isReadAuthorized').resolves(true);
            this.sandbox.stub(TenantDAO, 'get').resolves(tenantModel);
            this.sandbox.stub(SubProjectDAO, 'get').resolves(subProjectModel);
            this.sandbox.stub(DatasetDAO, 'get').resolves([datasetModel, undefined]);
            this.sandbox.stub(Locker, "getLock").resolves("toDatasetLock");
            this.sandbox.stub(Locker, "isWriteLock").returns(true);
            this.sandbox.stub(DESStorage, 'getRecord').resolves({ id: "" });

            await Handler.handler(req, res, op);
            Tx.check202(res.statusCode)

        } );

        Tx.testExpAsync(async (req: expRequest, res: expResponse, op: UtilityOP) => {

            op = UtilityOP.CP;

            req.query = {};
            req.query.sdpath_from = "sd://tenant/subproject/path/mydata.txt";
            req.query.sdpath_to = "sd://tenant/subproject/path2/";

            //
            subProjectModel.enforce_key = true;
            //

            this.sandbox.stub(Auth, 'isWriteAuthorized').resolves(true);
            this.sandbox.stub(Auth, 'isReadAuthorized').resolves(true);
            this.sandbox.stub(TenantDAO, 'get').resolves(tenantModel);
            this.sandbox.stub(SubProjectDAO, 'get').resolves(subProjectModel);
            this.sandbox.stub(DatasetDAO, 'getByKey').resolves(undefined);
            this.sandbox.stub(DESStorage, 'getRecord').resolves({ id: "" });

            await Handler.handler(req, res, op);
            Tx.check404(res.statusCode)

        } );

        Tx.testExpAsync(async (req: expRequest, res: expResponse, op: UtilityOP) => {

            op = UtilityOP.CP;

            req.query = {};
            req.query.sdpath_from = "sd://tenant/subproject/path/mydata.txt";
            req.query.sdpath_to = "sd://tenant1/subproject/path2/";

            await Handler.handler(req, res, op);
            Tx.check400(res.statusCode)

        } );

        Tx.testExpAsync(async (req: expRequest, res: expResponse, op: UtilityOP) => {

            op = UtilityOP.CP;

            req.query = {};
            req.query.sdpath_from = "sd://tenant/subproject/path/mydata.txt";
            req.query.sdpath_to = "sd://tenant1/";

            await Handler.handler(req, res, op);
            Tx.check400(res.statusCode)

        } );

        Tx.testExpAsync(async (req: expRequest, res: expResponse, op: UtilityOP) => {

            op = UtilityOP.CP;

            req.query = {};
            req.query.sdpath_from = "sd://tenant/subproject/path/mydata.txt";
            req.query.sdpath_to = "sd:/";

            await Handler.handler(req, res, op);
            Tx.check400(res.statusCode)

        } );

        Tx.testExpAsync(async (req: expRequest, res: expResponse, op: UtilityOP) => {

            op = UtilityOP.CP;

            req.query = {};
            req.query.sdpath_from = "sd://tenant/";
            req.query.sdpath_to = "sd:/";

            await Handler.handler(req, res, op);
            Tx.check400(res.statusCode)

        } );

        Tx.testExpAsync(async (req: expRequest, res: expResponse, op: UtilityOP) => {

            op = UtilityOP.CP;

            req.query = {};
            req.query.sdpath_from = "sd:/";
            req.query.sdpath_to = "sd:/";

            await Handler.handler(req, res, op);
            Tx.check400(res.statusCode)

        } );
        
    };

    private static getConnectionStringTest(tenantModel: ITenantModel, subProjectModel: SubProjectModel, datasetModel: DatasetModel, iCredentials: ICredentials) {

        Tx.sectionInit("getConnectionStringTest");

        Tx.testExpAsync(async (req: expRequest, res: expResponse, op: UtilityOP) => {

            op = UtilityOP.UPLOAD_CONNECTION_STRING;

            req.query = {};
            req.query.sdpath = "sd://tenant/subproject/path/mydata.txt";

            this.sandbox.stub(TenantDAO, 'get').resolves(tenantModel);
            this.sandbox.stub(SubProjectDAO, 'get').resolves(subProjectModel);
            this.sandbox.stub(DatasetDAO, 'get').resolves([datasetModel, undefined]);
            this.sandbox.stub(Auth, "isWriteAuthorized").resolves(true);
            this.sandbox.stub(CredentialsFactory, "build").returns(iCredentials);

            await Handler.handler(req, res, op);
            Tx.check200(res.statusCode)

        } );

        Tx.testExpAsync(async (req: expRequest, res: expResponse, op: UtilityOP) => {

            op = UtilityOP.DOWNLOAD_CONNECTION_STRING;

            req.query = {};
            req.query.sdpath = "sd://tenant/subproject/path/mydata.txt";

            this.sandbox.stub(TenantDAO, 'get').resolves(tenantModel);
            this.sandbox.stub(SubProjectDAO, 'get').resolves(subProjectModel);
            this.sandbox.stub(DatasetDAO, 'get').resolves([datasetModel, undefined]);
            this.sandbox.stub(Auth, "isReadAuthorized").resolves(true);
            this.sandbox.stub(CredentialsFactory, "build").returns(iCredentials);

            await Handler.handler(req, res, op);
            Tx.check200(res.statusCode)

        } );

        Tx.testExpAsync(async (req: expRequest, res: expResponse, op: UtilityOP) => {

            op = UtilityOP.UPLOAD_CONNECTION_STRING;

            req.query = {};
            req.query.sdpath = "sd://tenant/subproject/path/mydata.txt";

            //
            subProjectModel.enforce_key = true;
            //


            this.sandbox.stub(TenantDAO, 'get').resolves(tenantModel);
            this.sandbox.stub(SubProjectDAO, 'get').resolves(subProjectModel);
            this.sandbox.stub(DatasetDAO, 'getByKey').resolves(datasetModel);
            this.sandbox.stub(Auth, "isWriteAuthorized").resolves(true);
            this.sandbox.stub(CredentialsFactory, "build").returns(iCredentials);

            await Handler.handler(req, res, op);
            Tx.check200(res.statusCode)

        } );

        Tx.testExpAsync(async (req: expRequest, res: expResponse, op: UtilityOP) => {

            op = UtilityOP.UPLOAD_CONNECTION_STRING;

            req.query = {};
            req.query.sdpath = "sd://tenant/";

            await Handler.handler(req, res, op);
            Tx.check400(res.statusCode)

        } );

        Tx.testExpAsync(async (req: expRequest, res: expResponse, op: UtilityOP) => {

            op = UtilityOP.UPLOAD_CONNECTION_STRING;

            req.query = {};
            req.query.sdpath = "sd:/";

            await Handler.handler(req, res, op);
            Tx.check400(res.statusCode)

        } );

        Tx.testExpAsync(async (req: expRequest, res: expResponse, op: UtilityOP) => {

            op = UtilityOP.UPLOAD_CONNECTION_STRING;

            req.query = {};
            req.query.sdpath = "sd:/";

            await Handler.handler(req, res, op);
            Tx.check400(res.statusCode)

        } );
        
    };

    private static listStorageTiersTest() {

        Tx.sectionInit("listStorageTiersTest");

        Tx.testExpAsync(async (req: expRequest, res: expResponse, op: UtilityOP) => {

            op = UtilityOP.STORAGE_TIERS;

            await Handler.handler(req, res, op);
            Tx.check200(res.statusCode)

        } );
        
    };

    private static errorTest() {

        Tx.sectionInit("errorTest");

        Tx.testExpAsync(async (req: expRequest, res: expResponse, op: UtilityOP) => {

            op = 10;

            await Handler.handler(req, res, op);
            Tx.check500(res.statusCode)

        } );
        
    };

};
