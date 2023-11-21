import sinon from 'sinon';
import {Tx} from "../../utils";
import { AWSStorage, AwsSeistore } from '../../../../src/cloud/providers/aws';
import { Utils } from '../../../../src/shared/utils';
import * as uuid from 'uuid';

export class TestAWSSeistore {
    private static sandbox: sinon.SinonSandbox;
    private static AwsSeistore: AwsSeistore;
    private static testSubproject: {
        name: string;
        tenant: string;
        admin: string;
        storage_class: string;
        storage_location: string;
        ltag: string;
        gcs_bucket: string;
        enforce_key: boolean;
        access_policy: string;
    } = {
        name: 'TestSubproject',
        tenant: 'TestTenant',
        admin: 'TestAdmin',
        storage_class: 'TestStorageClass',
        storage_location: 'TestStorageLocation',
        ltag: 'TestLtag',
        gcs_bucket: 'TestGcsBucket',
        enforce_key: false,
        access_policy: 'TestAccessPolicy',
    }
    private static testTenant: {
        name: string;
        esd: string;
        gcpid: string;
        default_acls: string;
    } = {
        name: 'TestTenant',
        esd: 'testEsd.domain',
        gcpid: 'testGcpId',
        default_acls: 'testDefaultAcls',
    };
    public static run() {
        describe(Tx.testInit('AWS Seistore'), () => {
                
                beforeEach(() => {
                    this.sandbox = sinon.createSandbox();
                    this.AwsSeistore = new AwsSeistore();
                });
    
                afterEach(() => {
                    this.sandbox.restore();
                });
                
                this.testGetEmailFromTokenPayload();
                this.testNotifySubprojectCreationStatus();
                this.testGetDatasetStorageResource();
                this.testGetSubprojectStorageResources();
                this.testDeleteStorageResources();
                this.testHandleReadinessCheck();
                this.testValidateAccessPolicy();
                this.testCheckExtraSubprojectCreateParams();
        })
    }

    private static testGetEmailFromTokenPayload() {
        Tx.sectionInit('Get Email From Token Payload');
        const userCredentials = "userCredentials";
        Tx.test(async () => {
            const internalSwapForSauth = true;
            this.sandbox.stub(Utils, "getPayloadFromStringToken").returns({username: "email@email.com"});
            this.sandbox.stub(Utils, "checkSauthV1EmailDomainName").returns("email@email.com");
            const result = await this.AwsSeistore.getEmailFromTokenPayload(userCredentials, internalSwapForSauth);
            Tx.checkTrue(result === "email@email.com");
        })

        Tx.test(async () => {
            const internalSwapForSauth = false;
            this.sandbox.stub(Utils, "getPayloadFromStringToken").returns({username: "email@email.com"});
            const result = await this.AwsSeistore.getEmailFromTokenPayload(userCredentials, internalSwapForSauth);
            Tx.checkTrue(result === "email@email.com");
        })
            
    }

    private static testNotifySubprojectCreationStatus() {
        Tx.sectionInit('Notify Subproject Creation Status');
        const subproject = this.testSubproject;
        const status = "status";
        Tx.test(async () => {
            const result = await this.AwsSeistore.notifySubprojectCreationStatus(subproject, status);
            Tx.checkTrue(result === "Not Implemented");
        })
    }

    private static testGetDatasetStorageResource() {
        Tx.sectionInit('Get Dataset Storage Resource');
        const tenant = this.testTenant;
        const subproject = this.testSubproject;
        Tx.test(async () => {
            const result = await this.AwsSeistore.getDatasetStorageResource(tenant, subproject);
            const regexPattern = /^TestGcsBucket\/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[4][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;
            Tx.checkTrue(regexPattern.test(result));
        })
    }

    private static testGetSubprojectStorageResources() {
        Tx.sectionInit('Get Subproject Storage Resources');
        const tenant = this.testTenant;
        const subproject = this.testSubproject;
        Tx.test(async () => {
            const createBucketStub = this.sandbox.stub(AWSStorage.prototype, "createBucket").returns(Promise.resolve());
            await this.AwsSeistore.getSubprojectStorageResources(tenant, subproject);
            Tx.checkTrue(createBucketStub.calledOnce);
        })
    }

    private static testDeleteStorageResources() {
        Tx.sectionInit('Delete Storage Resources');
        const tenant = this.testTenant;
        const subproject = this.testSubproject;
        Tx.test(async () => {
            const deleteFilesStub = this.sandbox.stub(AWSStorage.prototype, "deleteFiles").returns(Promise.resolve());
            const deleteBucketStub = this.sandbox.stub(AWSStorage.prototype, "deleteBucket").returns(Promise.resolve());
            await this.AwsSeistore.deleteStorageResources(tenant, subproject);
            Tx.checkTrue(deleteFilesStub.calledOnce);
            Tx.checkTrue(deleteBucketStub.calledOnce);
        })
    }

    private static testHandleReadinessCheck() {
        Tx.sectionInit('Handle Readiness Check');
        Tx.test(async () => {
            const result = await this.AwsSeistore.handleReadinessCheck();
            Tx.checkTrue(result === true);
        })
    }

    private static testValidateAccessPolicy() {
        Tx.sectionInit('Validate Access Policy');
        const subproject = this.testSubproject;
        const accessPolicy = "accessPolicy";
        Tx.test(() => {
            try {
                this.AwsSeistore.validateAccessPolicy(subproject, accessPolicy);
            }
            catch (err) {
                Tx.checkTrue(err.error.code === 400);
            }
        })
    }

    private static testCheckExtraSubprojectCreateParams() {
        Tx.sectionInit('Check Extra Subproject Create Params');
        const requestBody = {
            name: 'TestSubproject',
            tenant: 'TestTenant',
            admin: 'TestAdmin',
            storage_class: 'TestStorageClass',
            storage_location: 'TestStorageLocation',
            ltag: 'TestLtag',
            gcs_bucket: 'TestGcsBucket',
            enforce_key: false,
            access_policy: 'TestAccessPolicy',
        };
        const subproject = this.testSubproject;
        Tx.test(() => {

            const result = this.AwsSeistore.checkExtraSubprojectCreateParams(requestBody, subproject);
            Tx.checkTrue(result === undefined);
        })
    }

}