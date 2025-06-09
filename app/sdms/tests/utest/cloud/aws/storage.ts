import sinon from 'sinon';
import { Tx } from '../../utils';
import { AWSStorage, AWSConfig, AWSDataEcosystemServices } from '../../../../src/cloud/providers/aws';
import { AWSSSMhelper } from '../../../../src/cloud/providers/aws/ssmhelper';
import { Error } from "../../../../src/shared/error";
import { Config } from '../../../../src/cloud';
export class TestStorage {
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
                this.sandbox.stub(AWSDataEcosystemServices, 'getTenantIdFromPartitionID').resolves('testTenantId');
                this.sandbox.stub(AWSSSMhelper.prototype, 'getSSMParameter').resolves('testBucket');
                this.sandbox.define(AWSConfig, 'AWS_REGION', 'us-west-2');
                this.storage = new AWSStorage(this.testTenant);
                this.getBucketSpy = this.storage['getBucket'] = this.sandbox.stub().resolves();
                this.storage['awsBucket'] = 'testBucket';
            });

            afterEach(() => {
                this.sandbox.restore();
            });

            this.testRandomBucketName();
            this.testGetFolder();
            this.testCreateBucket();
            this.testDeleteBucket();
            this.testDeleteFiles();
            this.testSaveObject();
            this.testDeleteObject();
            this.testDeleteObjects();
            this.testCopy();
            this.testBucketExists();
            this.testGetStorageTiers();
        });
    }

    private static testRandomBucketName() {
        Tx.sectionInit('Random Bucket Name');
    
        Tx.test(async () => {
            const bucketName = await this.storage.randomBucketName();
            const bucketName1 = await this.storage.randomBucketName();

            Tx.checkTrue(bucketName !== bucketName1);
        });
    }

    private static testGetFolder() {
        Tx.sectionInit('Get Folder');

        Tx.test(() => {
            const folderName = 'testFolderName';
            const folder = this.storage.getFolder(folderName);
            const expectedFolder = folderName.substr('testBucket'.length + 2);
            Tx.checkTrue(expectedFolder === folder);
        });
    }

    private static testCreateBucket() {
        Tx.sectionInit('Create Bucket');
        const folderName = 'testFolderName';
        const location = 'testLocation';
        const storageClass = 'testStorageClass';
        Tx.test(async () => {
            
            const sendStub = this.sandbox.stub(this.storage['s3'], 'send').resolves({});

            await this.storage.createBucket(folderName, location, storageClass);
            Tx.checkTrue(sendStub.calledOnce);
            Tx.checkTrue(this.getBucketSpy.calledOnce);
        });

        Tx.test(async () => {
            this.sandbox.stub(this.storage, 'createBucket').throws(Error.make(500, 'Test Error'));

            try {
                await this.storage.createBucket(folderName, location, storageClass);
            }
            catch (err) {
                Tx.checkTrue(err.error.code === 500);
            }
        });
    }

    private static testDeleteBucket() {
        Tx.sectionInit('Delete Bucket');
        const folderName = 'testFolderName';
        const force = false;
        Tx.test(async () => {
            const sendStub = this.sandbox.stub(this.storage['s3'], 'send').resolves({});

            await this.storage.deleteBucket(folderName, force);
            Tx.checkTrue(sendStub.calledOnce);
            Tx.checkTrue(this.getBucketSpy.calledOnce);
        });

        Tx.test(async () => {
            this.sandbox.stub(this.storage, 'deleteBucket').throws(Error.make(500, 'Test Error'));

            try {
                await this.storage.deleteBucket(folderName, force);
            }
            catch (err) {
                Tx.checkTrue(err.error.code === 500);
            }
        });

        Tx.test(async () => {
            const force = true;
            const deleteFilesStub = this.sandbox.stub(this.storage, 'deleteFiles').returns(Promise.resolve());

            await this.storage.deleteBucket(folderName, force);
            Tx.checkTrue(deleteFilesStub.calledOnce);
        });
    }

    private static testDeleteFiles() {
        Tx.sectionInit('Delete Files');
        const folderName = 'testFolderName';
        // checks if listedObjects.Contents.length is 0
        Tx.test(async () => {
            const sendStub = this.sandbox.stub(this.storage['s3'], 'send').resolves({Contents: []});

            const result = await this.storage.deleteFiles(folderName);
            Tx.checkTrue(sendStub.calledOnce);
            Tx.checkTrue(result === undefined)
        });
        // checks if listedObjects.Contents.length is > 0
        Tx.test(async () => {
            const sendStub = this.sandbox.stub(this.storage['s3'], 'send');
            sendStub.onFirstCall().resolves({Contents: [{Key: 'testKey'}]});
            sendStub.onSecondCall().resolves({});

            await this.storage.deleteFiles(folderName);
            Tx.checkTrue(sendStub.calledTwice);
        }); 
    }

    private static testSaveObject() {
        Tx.sectionInit('Save Object');
        const folderName = 'testFolderName';
        const fileName = 'testFileName';
        const fileContent = 'testFileContent';
        Tx.test(async () => {
            const sendStub = this.sandbox.stub(this.storage['s3'], 'send').resolves({});

            await this.storage.saveObject(folderName, fileName, fileContent);
            Tx.checkTrue(sendStub.calledOnce);
        });

        Tx.test(async () => {
            this.sandbox.stub(this.storage, 'saveObject').throws(Error.make(500, 'Test Error'));

            try {
                await this.storage.saveObject(folderName, fileName, fileContent);
            }
            catch (err) {
                Tx.checkTrue(err.error.code === 500);
            }
        });
    }

    private static testDeleteObject() {
        Tx.sectionInit('Delete Objects');
        const folderName = 'testFolderName';
        const fileName = 'testFileName';
        Tx.test(async () => {
            const sendStub = this.sandbox.stub(this.storage['s3'], 'send').resolves({});

            await this.storage.deleteObject(folderName, fileName);
            Tx.checkTrue(sendStub.calledOnce);
        });

        Tx.test(async () => {
            this.sandbox.stub(this.storage, 'deleteObject').throws(Error.make(500, 'Test Error'));
            try {
                await this.storage.deleteObject(folderName, fileName);
            }
            catch (err) {
                Tx.checkTrue(err.error.code === 500);
            }
        });
    }

    private static testDeleteObjects() {
        Tx.sectionInit('Delete Objects');
        const folderName = 'testFolderName';
        const prefix = 'testPrefix';
        
        Tx.test(async () => {
            const sendStub = this.sandbox.stub(this.storage['s3'], 'send');
            sendStub.onFirstCall().resolves({Contents: [{Key: 'testKey'}]});
            sendStub.onSecondCall().resolves({});
            
            await this.storage.deleteObjects(folderName, prefix);
            Tx.checkTrue(sendStub.calledTwice);
        });

        Tx.test(async () => {
            const sendStub = this.sandbox.stub(this.storage['s3'], 'send').resolves({Contents: []});
        
            const result = await this.storage.deleteObjects(folderName, prefix);
            Tx.checkTrue(result === undefined);
        });


        Tx.test(async () => {
            this.sandbox.stub(this.storage, 'deleteObjects').throws(Error.make(500, 'Test Error'));
            try {
                await this.storage.deleteObjects(folderName, prefix);
            }
            catch (err) {
                Tx.checkTrue(err.error.code === 500);
            }
        });
    }

    private static testCopy() {
        Tx.sectionInit('Copy');
        const sourceFolderName = 'testSourceFolderName';
        const sourceFileName = 'testSourceFileName';
        const destinationFolderName = 'testDestinationFolderName';
        const destinationFileName = 'testDestinationFileName';
        const ownerEmail = 'testOwnerEmail';
        Tx.test(async () => {
            const sendStub = this.sandbox.stub(this.storage['s3'], 'send');
            sendStub.onFirstCall().resolves({ Contents: [{ Key: 'testKey' }]});
            sendStub.onSecondCall().resolves({});

            await this.storage.copy(sourceFolderName, sourceFileName, destinationFolderName, destinationFileName, ownerEmail);
            Tx.checkTrue(sendStub.calledTwice);
        });
    }

    private static testBucketExists() {
        Tx.sectionInit('Bucket Exists');
        const bucketName = 'testBucketName';
        
        Tx.test(async () => {
            const sendStub = this.sandbox.stub(this.storage['s3'], 'send').resolves({Contents: []});
            const result = await this.storage.bucketExists(bucketName);
            Tx.checkFalse(result);
        });

        Tx.test(async () => {
            const sendStub = this.sandbox.stub(this.storage['s3'], 'send').resolves({Contents: [{Key: 'testKey'}]});
            const result = await this.storage.bucketExists(bucketName);
            Tx.checkTrue(result);
        });
    }

    private static testGetStorageTiers() {
        Tx.sectionInit('Get Storage Tiers');
        Tx.test(async () => {
            try {
                await this.storage.getStorageTiers();
            } catch (err) {
                Tx.checkTrue(err.message === "Method not implemented.");
            }
        });
    }
}