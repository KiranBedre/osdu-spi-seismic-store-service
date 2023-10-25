import sinon from 'sinon';
import { Tx } from '../../utils';
import { AWSStorage } from '../../../../src/cloud/providers/aws';
import { Error } from "../../../../src/shared/error";
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
                this.storage = new AWSStorage(this.testTenant);
                this.getBucketSpy = this.storage['getBucket'] = this.sandbox.spy();
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
            const expectedFolder = folderName.substr(''.length + 2);
            Tx.checkTrue(expectedFolder === folder);
        });
    }

    private static testCreateBucket() {
        Tx.sectionInit('Create Bucket');
        const folderName = 'testFolderName';
        const location = 'testLocation';
        const storageClass = 'testStorageClass';
        Tx.test(async () => {
            
            const putObjectStub = this.sandbox.stub((this.storage['s3'] as any), 'putObject').returns({
                promise: this.sandbox.stub().resolves({})
            });

            await this.storage.createBucket(folderName, location, storageClass);
            Tx.checkTrue(putObjectStub.calledOnce);
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
            const deleteObjectStub = this.sandbox.stub((this.storage['s3'] as any), 'deleteObject').returns({
                promise: this.sandbox.stub().resolves({})
            });

            await this.storage.deleteBucket(folderName, force);
            Tx.checkTrue(deleteObjectStub.calledOnce);
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
            const listObjectsV2Stub = this.sandbox.stub((this.storage['s3'] as any), 'listObjectsV2').returns({
                promise: this.sandbox.stub().resolves({Contents: []})
            });

            const deleteObjectsStub = this.sandbox.stub((this.storage['s3'] as any), 'deleteObjects').returns({
                promise: this.sandbox.stub().resolves({})
            });

            const result = await this.storage.deleteFiles(folderName);
            Tx.checkTrue(listObjectsV2Stub.calledOnce);
            Tx.checkTrue(result === undefined)
        });
        // checks if listedObjects.Contents.length is > 0
        Tx.test(async () => {
            this.sandbox.stub((this.storage['s3'] as any), 'listObjectsV2').returns({
                promise: this.sandbox.stub().resolves({Contents: [{Key: 'testKey'}]})
            });

            const deleteObjectsStub = this.sandbox.stub((this.storage['s3'] as any), 'deleteObjects').returns({
                promise: this.sandbox.stub().resolves({})
            });

            await this.storage.deleteFiles(folderName);
            Tx.checkTrue(deleteObjectsStub.calledOnce);
        }); 
    }

    private static testSaveObject() {
        Tx.sectionInit('Save Object');
        const folderName = 'testFolderName';
        const fileName = 'testFileName';
        const fileContent = 'testFileContent';
        Tx.test(async () => {
            const putObjectStub = this.sandbox.stub((this.storage['s3'] as any), 'putObject').returns({
                promise: this.sandbox.stub().resolves({})
            });

            await this.storage.saveObject(folderName, fileName, fileContent);
            Tx.checkTrue(putObjectStub.calledOnce);
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
            const deleteObjectStub = this.sandbox.stub((this.storage['s3'] as any), 'deleteObject').returns({
                promise: this.sandbox.stub().resolves({})
            });

            await this.storage.deleteObject(folderName, fileName);
            Tx.checkTrue(deleteObjectStub.calledOnce);
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
            const deleteObjectStub = this.sandbox.stub((this.storage['s3'] as any), 'deleteObjects').returns({
                promise: this.sandbox.stub().resolves({})
            });
            const listObjectsV2Stub = this.sandbox.stub((this.storage['s3'] as any), 'listObjectsV2').returns({
                promise: this.sandbox.stub().resolves({Contents: [{Key: 'testKey'}]})
            });
            await this.storage.deleteObjects(folderName, prefix);
            Tx.checkTrue(deleteObjectStub.calledOnce);
            Tx.checkTrue(listObjectsV2Stub.calledOnce);
        });

        Tx.test(async () => {
            this.sandbox.stub((this.storage['s3'] as any), 'listObjectsV2').returns({
                promise: this.sandbox.stub().resolves({Contents: []})
            });
        
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
            const copyObjectStub = this.sandbox.stub((this.storage['s3'] as any), 'copyObject').returns({
                promise: this.sandbox.stub().resolves({})
            });
            const listObjectsStub = this.sandbox.stub((this.storage['s3'] as any), 'listObjects').returns({
                promise: this.sandbox.stub().resolves({ Contents: [{ Key: 'testKey' }]})
            });

            await this.storage.copy(sourceFolderName, sourceFileName, destinationFolderName, destinationFileName, ownerEmail);
            Tx.checkTrue(listObjectsStub.calledOnce);
            Tx.checkTrue(copyObjectStub.calledOnce);
        });
    }

    private static testBucketExists() {
        Tx.sectionInit('Bucket Exists');
        const bucketName = 'testBucketName';
        
        Tx.test(async () => {
            this.sandbox.stub((this.storage['s3'] as any), 'listObjectsV2').returns({
                promise: this.sandbox.stub().resolves({Contents: []})
            });
            const result = await this.storage.bucketExists(bucketName);
            Tx.checkFalse(result);
        });

        Tx.test(async () => {
            this.sandbox.stub((this.storage['s3'] as any), 'listObjectsV2').returns({
                promise: this.sandbox.stub().resolves({Contents: [{Key: 'testKey'}]})
            });
            const result = await this.storage.bucketExists(bucketName);
            Tx.checkTrue(result);
        });
    }
}