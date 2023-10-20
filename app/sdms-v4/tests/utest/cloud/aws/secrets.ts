import { Tx } from "../../utils";
import { AwsSecrets } from "../../../../src/cloud/providers/aws/secrets";
import sinon from "sinon";
import * as NodeCacheModule from '../../../../src/shared/node-cache';
import { PartitionCoreService } from "../../../../src/services";



export class TestAwsSecrets {
    private static sandbox: sinon.SinonSandbox;
    private static secretsHelper: AwsSecrets;
    private static fakeCache: sinon.SinonStubbedInstance<NodeCacheModule.InMemoryCache>;
    public static run() {
        describe(Tx.testInit('AWS Secrets'), () => {

            beforeEach(() => {
                this.sandbox = sinon.createSandbox();
                this.secretsHelper = new AwsSecrets();
                
            });

            afterEach(() => {
                this.sandbox.restore();
            });

            this.testGetTenantIdFromPartitionID();
            this.testBucketFromPartitionID();
        });
    }

    private static testGetTenantIdFromPartitionID() {
        Tx.sectionInit('get tenant id from partition id');
        
        this.fakeCache = sinon.createStubInstance(NodeCacheModule.InMemoryCache);
        
        const testPartitionId = 'testPartition';
        const expectedTenantId = 'someTenantId';

        Tx.test(async () => {
            this.sandbox.stub(NodeCacheModule, 'getInMemoryCacheInstance').returns(this.fakeCache as unknown as NodeCacheModule.InMemoryCache);
            this.fakeCache.get.returns(expectedTenantId); 
            const result = await AwsSecrets.getTenantIdFromPartitionID(testPartitionId);

            Tx.checkTrue(result === expectedTenantId);
        })

        Tx.test(async () => {
            const mockServiceResponse = {
                tenantId: {
                    value: expectedTenantId
                }
            };
            this.fakeCache.get.returns(undefined);
            this.sandbox.stub(PartitionCoreService, 'getPartitionConfiguration').resolves(mockServiceResponse);

            const result = await AwsSecrets.getTenantIdFromPartitionID(testPartitionId);

            Tx.checkTrue(result === expectedTenantId);
        
        })
    }

    private static testBucketFromPartitionID() {
        Tx.sectionInit('get bucket from partition id');
        const testPartitionId = 'testPartition';
        const expectedBucket = 'someBucket';

        Tx.test(async () => {
            this.sandbox.stub(NodeCacheModule, 'getInMemoryCacheInstance').returns(this.fakeCache as unknown as NodeCacheModule.InMemoryCache);
            this.fakeCache.get.returns(expectedBucket); 
            const result = await AwsSecrets.getTenantIdFromPartitionID(testPartitionId);

            Tx.checkTrue(result === expectedBucket);
        })
    }
}
