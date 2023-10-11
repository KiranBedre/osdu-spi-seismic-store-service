import axios from "axios";
import sinon from "sinon";
import {Tx} from "../../utils";
import { AWSCredentials, AWSDataEcosystemServices } from "../../../../src/cloud/providers/aws";
import { getInMemoryCacheInstance } from "../../../../src/shared";
import { Error } from "../../../../src/shared/error";

export class TestAWSDataEcosystem {
    private static sandbox: sinon.SinonSandbox;
    private static awsDataEcosystemService: AWSDataEcosystemServices;

    public static run() {
        describe(Tx.testInit('AWS Data Ecosystem Services'), () => {

            beforeEach(() => {
                this.sandbox = sinon.createSandbox();
                this.awsDataEcosystemService = new AWSDataEcosystemServices();
            });

            afterEach(() => {
                this.sandbox.restore();
            });

            this.testGetMethods();
            this.testGetAuthorizationHeader();
            this.testFixGroupMembersResponse();
            this.testGetUserAddBodyRequest();
            this.testTenantNameAndDataPartitionIDShouldMatch();
            this.testGetTenantIdFromPartitionID();
        });
    }

    private static testGetMethods() {
        Tx.sectionInit('Get Methods');
        
        Tx.test((done) => {
            Tx.checkTrue(this.awsDataEcosystemService.getDataPartitionIDRestHeaderName() === 'data-partition-id');
            done()
        });

        Tx.test((done) => {
            Tx.checkTrue(this.awsDataEcosystemService.getEntitlementBaseUrlPath() === '/api/entitlements/v2');
            done()
        });

        Tx.test((done) => {
            Tx.checkTrue(this.awsDataEcosystemService.getComplianceBaseUrlPath() === '/api/legal/v1');
            done()
        });

        Tx.test((done) => {
            Tx.checkTrue(this.awsDataEcosystemService.getStorageBaseUrlPath() === '/api/storage/v2');
            done()
        });

        Tx.test((done) => {
            Tx.checkTrue(this.awsDataEcosystemService.getUserAssociationSvcBaseUrlPath() === 'userAssociation/v1');
            done()
        });

        Tx.test((done) => {
            Tx.checkTrue(AWSDataEcosystemServices.getPartitionBaseUrlPath() === '/api/partition/v1/partitions/');
            done()
        });

        Tx.test((done) => {
            Tx.checkTrue(this.awsDataEcosystemService.getPolicySvcBaseUrlPath() === 'api/policy/v1');
            done()
        } );
    }

    private static testGetAuthorizationHeader() {
        Tx.sectionInit('getAuthorizationHeader method');
    
        Tx.test(() => {
            const userToken = 'SampleToken';
            return this.awsDataEcosystemService.getAuthorizationHeader(userToken).then(result => {
                Tx.checkTrue(result === 'Bearer SampleToken');
            });
        });
    }

    private static testFixGroupMembersResponse() {
        Tx.sectionInit('fixGroupMembersResponse method');
        Tx.test((done) => {
            const groupMembers: any = { groupName: 'testGroup' }; // Replace with a sample groupMembers object
            Tx.checkTrue(this.awsDataEcosystemService.fixGroupMembersResponse(groupMembers) === groupMembers);
            done();
        });
    }

    private static testGetUserAddBodyRequest() {
        Tx.sectionInit('getUserAddBodyRequest method');
        Tx.test(() => {
            const userEmail = 'test@example.com';
            const role = 'admin';
            Tx.checkTrue(JSON.stringify(this.awsDataEcosystemService.getUserAddBodyRequest(userEmail, role)) === JSON.stringify({ email: userEmail, role }));
        });
    }

    private static testTenantNameAndDataPartitionIDShouldMatch() {
        Tx.sectionInit('tenantNameAndDataPartitionIDShouldMatch method');
        Tx.test(() => {
            Tx.checkFalse(this.awsDataEcosystemService.tenantNameAndDataPartitionIDShouldMatch());
        });
    }

    private static testGetTenantIdFromPartitionID() {
        Tx.sectionInit('getTenantIdFromPartitionID method');

        Tx.test(async () => {
            const cacheInstance = getInMemoryCacheInstance();
            const getStub = this.sandbox.stub(cacheInstance, 'get').returns(undefined);
            const setStub = this.sandbox.stub(cacheInstance, 'set');

            const getServiceCredentialsStub = this.sandbox.stub(AWSCredentials, 'getServiceCredentials').resolves('Bearer sampleToken');
            const axiosStub = this.sandbox.stub(axios, 'get').resolves({ data: { tenantId: { value: 'sampleTenantId' } } });


            return AWSDataEcosystemServices.getTenantIdFromPartitionID('samplePartitionId').then(result => {
                Tx.checkTrue(result === 'sampleTenantId');
            }
            );
        });

        Tx.test(async () => {
            const cacheInstance = getInMemoryCacheInstance();
            const getStub = this.sandbox.stub(cacheInstance, 'get').returns('sampleTenantId');
            const setStub = this.sandbox.stub(cacheInstance, 'set');
        
            const getServiceCredentialsStub = this.sandbox.stub(AWSCredentials, 'getServiceCredentials').resolves('Bearer sampleToken');
            const axiosStub = this.sandbox.stub(axios, 'get').throws(Error.make(500, 'Error message'));

            try {
                await AWSDataEcosystemServices.getTenantIdFromPartitionID('samplePartitionId');
            } catch (e) {
                Tx.checkTrue(e.error.code === 500);
            }
        });


    }

}