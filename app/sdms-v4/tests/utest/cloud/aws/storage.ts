import { PutObjectCommand } from '@aws-sdk/client-s3';
import { AWSStorage } from '../../../../src/cloud/providers/aws';
import { Tx } from '../../utils';
import sinon from 'sinon';
import { Error } from "../../../../src/shared/error";

export class TestAWSStorage {
    private static sandbox: sinon.SinonSandbox;
    private static storage: AWSStorage;
    private static getBucketSpy;
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
        describe(Tx.testInit('AWS Storage'), () => {

            beforeEach(() => {
                this.sandbox = sinon.createSandbox();
                this.storage = new AWSStorage(this.testTenant);
                this.getBucketSpy = this.storage['getBucket'] = this.sandbox.spy();
            });

            afterEach(() => {
                this.sandbox.restore();
            });
            this.testCreateBucket();
            this.testDeleteBucket();
            this.testBucketExists();
        });
    }

    private static testCreateBucket() {
        Tx.sectionInit('AWS Storage - Create Bucket');

        Tx.test(async () => {
            const bucketName = 'testBucket';
            this.sandbox.mock(PutObjectCommand.prototype);
            const mockSend = this.sandbox.stub((this.storage as any).s3, 'send').resolves();

            await this.storage.createBucket(bucketName);
            Tx.checkTrue(mockSend.calledOnce);
            
        })

    }

    private static testDeleteBucket() {
        Tx.sectionInit('Delete Bucket');
        const folderName = 'testFolderName';
        Tx.test(async () => {
            const deleteObjectStub = this.sandbox.stub((this.storage as any).s3, 'send').resolves({Contents:[]});

            await this.storage.deleteBucket(folderName);
            Tx.checkTrue(deleteObjectStub.calledOnce);
            Tx.checkTrue(this.getBucketSpy.calledOnce);
        });

        Tx.test(async () => {
            this.sandbox.stub(this.storage, 'deleteBucket').throws(Error.make(500, 'Test Error'));

            try {
                await this.storage.deleteBucket(folderName);
            }
            catch (err) {
                Tx.checkTrue(err.error.code === 500);
            }
        });

    }

    private static testBucketExists() {
        Tx.sectionInit('Bucket Exists');
        const bucketName = 'testBucketName';
        
        Tx.test(async () => {
            this.sandbox.stub((this.storage as any).s3, 'send').resolves({Contents:[]});
            const result = await this.storage.bucketExists(bucketName);
            Tx.checkFalse(result);
        });

        Tx.test(async () => {
            this.sandbox.stub((this.storage as any).s3, 'send').resolves({Contents: [{Key: 'testKey'}]});
            
            const result = await this.storage.bucketExists(bucketName);
            Tx.checkFalse(result);
        });
    }
}