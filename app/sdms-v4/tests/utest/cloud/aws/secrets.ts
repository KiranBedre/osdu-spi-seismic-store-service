import { Tx } from "../../utils";
import { AwsSecrets } from "../../../../src/cloud/providers/aws/secrets";
import sinon from "sinon";
import * as NodeCacheModule from '../../../../src/shared/node-cache';
import { PartitionCoreService } from "../../../../src/services";
import { AWSSSMhelper } from "../../../../src/cloud/providers/aws/ssmhelper";



export class TestAwsSecrets {
    private static sandbox: sinon.SinonSandbox;
    private static secretsHelper: AwsSecrets;
    private static ssmHelper: AWSSSMhelper;
    public static run() {
        describe(Tx.testInit('AWS Secrets'), () => {

            beforeEach(() => {
                this.sandbox = sinon.createSandbox();
                this.secretsHelper = new AwsSecrets();
                this.ssmHelper = new AWSSSMhelper();
            });

            afterEach(() => {
                this.sandbox.restore();
            });

            this.testGetTenantIdFromPartitionID();
            this.testGetBucketFromPartitionID();
        });
    }

    private static testGetTenantIdFromPartitionID() {
        Tx.sectionInit('get tenant id from partition id');
        let fakeCache: sinon.SinonStubbedInstance<NodeCacheModule.InMemoryCache>;
        // eslint-disable-next-line prefer-const
        fakeCache = sinon.createStubInstance(NodeCacheModule.InMemoryCache);
        
        const testPartitionId = 'testPartition';
        const expectedTenantId = 'someTenantId';

        Tx.test(async () => {
            this.sandbox.stub(NodeCacheModule, 'getInMemoryCacheInstance').returns(fakeCache as unknown as NodeCacheModule.InMemoryCache);
            fakeCache.get.returns(expectedTenantId); 
            const result = await AwsSecrets.getTenantIdFromPartitionID(testPartitionId);

            Tx.checkTrue(result === expectedTenantId);
        })

        Tx.test(async () => {
            const mockServiceResponse = {
                tenantId: {
                    value: expectedTenantId
                }
            };
            fakeCache.get.returns(undefined);
            this.sandbox.stub(PartitionCoreService, 'getPartitionConfiguration').resolves(mockServiceResponse);

            const result = await AwsSecrets.getTenantIdFromPartitionID(testPartitionId);

            Tx.checkTrue(result === expectedTenantId);
        
        })
    }

    private static testGetBucketFromPartitionID() {
        Tx.sectionInit('get bucket from partition id');
        let fakeCache: sinon.SinonStubbedInstance<NodeCacheModule.InMemoryCache>;
        // eslint-disable-next-line prefer-const
        fakeCache = sinon.createStubInstance(NodeCacheModule.InMemoryCache);

        const testPartitionId = 'testPartition';
        const expectedBucket = 'someBucket';

        Tx.test(async () => {
            this.sandbox.stub(NodeCacheModule, 'getInMemoryCacheInstance').returns(fakeCache as unknown as NodeCacheModule.InMemoryCache);
            fakeCache.get.returns(expectedBucket); 
            const result = await AwsSecrets.getBucketFromPartitionID(testPartitionId);

            Tx.checkTrue(result === expectedBucket);
        })

        Tx.test(async () => {
            fakeCache.get.returns(undefined);
            this.sandbox.stub(AwsSecrets, 'getTenantIdFromPartitionID').resolves('someTenantId');
            this.sandbox.stub(this.ssmHelper, 'getSSMParameter').resolves(expectedBucket);
            const result = await AwsSecrets.getBucketFromPartitionID(testPartitionId, this.ssmHelper);
            Tx.checkTrue(result === expectedBucket);
        
        });
    
    }
}
