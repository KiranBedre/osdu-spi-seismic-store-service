// ============================================================================
// Copyright 2017-2019, Schlumberger
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
// ============================================================================

import sinon from 'sinon';

import { Bucket, DeleteFilesOptions, File, Iam, Storage } from '@google-cloud/storage';
import { Acl } from '@google-cloud/storage/build/src/acl';
import { gc } from '../../../../src/cloud/providers';
import { Tx } from '../../utils';

export class TestGCSOSDUCore {

   public static sandbox: sinon.SinonSandbox;
   private static gcsStorage: gc.GCS;

   public static run() {

      describe(Tx.testInit('GCS-OSDU'), () => {

         beforeEach(() => {
            this.sandbox = sinon.createSandbox();
            this.gcsStorage = new gc.GCS(
               { gcpid: 'gcpid', default_acls:'x', esd: 'gcpid@domain.com', name: 'gcpid'});
         });
         afterEach(() => { this.sandbox.restore(); });

         this.testrandomBucketName();
         this.testCreateBucket();
         this.testDeleteBucket();
         this.testSaveObject();
         this.testDeleteObjects();
         this.testobjectsCopy();
      });
   }

   private static testrandomBucketName() {

      Tx.sectionInit('random bucket name');

      Tx.testExp(async (done: any) => {
         const name= await this.gcsStorage.randomBucketName();
         Tx.checkTrue(name.length > 0, done);
      });
   }

   private static testCreateBucket() {

      // [REVERT-DOWNSCOPE] re-enable this test
      // Tx.sectionInit('create bucket');

      // Tx.testExp(async (done: any) => {
      //    const createStub = this.sandbox.stub(Bucket.prototype, 'create');
      //    createStub.resolves();
      //    this.sandbox.stub(Bucket.prototype, 'setMetadata').resolves();
      //    await this.gcsStorage.createBucket('buckname', 'loc', 'storage-class');
      //    Tx.checkTrue(createStub.callCount === 1, done);
      // });
   }

   private static testDeleteBucket() {

      Tx.sectionInit('delete bucket');

      Tx.testExp(async (done: any) => {
         const deleteStub = this.sandbox.stub(Bucket.prototype, 'deleteFiles');
         deleteStub.resolves();
         await this.gcsStorage.deleteBucket('bucket-a');
         Tx.checkTrue(deleteStub.calledOnce, done);

      });
   }

   private static testSaveObject() {

      Tx.sectionInit('object save');

      Tx.test(async (done: any) => {
         const fileSaveStub = this.sandbox.stub(File.prototype, 'save');
         fileSaveStub.resolves();
         await this.gcsStorage.saveObject('buckname', 'objname', 'data');
         Tx.checkTrue(fileSaveStub.calledOnce, done);
      });

   }

   private static testDeleteObjects() {

      Tx.sectionInit('delete objects ');

      Tx.test(async (done: any) => {
         const deleteFilesStub = this.sandbox.stub(Bucket.prototype, 'deleteFiles');
         deleteFilesStub.resolves();
         await this.gcsStorage.deleteObjects('test://bucket-a', 'prefix');
         Tx.checkTrue(deleteFilesStub.calledOnce, done);
      });

      Tx.test(async (done: any) => {
         const deleteFiles = this.sandbox.stub(Bucket.prototype, 'deleteFiles');
         deleteFiles.resolves();
         await this.gcsStorage.deleteObjects('bucket-a', 'obj-a');

         const opts: DeleteFilesOptions = {
            force: true,
            prefix: 'obj-a/',
         };

         Tx.checkTrue(deleteFiles.calledWith(opts), done);
      });

      Tx.test(async (done: any) => {
         const deleteFiles = this.sandbox.stub(Bucket.prototype, 'deleteFiles');
         deleteFiles.resolves();
         await this.gcsStorage.deleteObjects('bucket-a', 'prefix//obj-b');

         const opts: DeleteFilesOptions = {
            force: true,
            prefix: 'prefix/obj-b/',
         };
         Tx.checkTrue(deleteFiles.calledWith(opts), done);
      });
   }

   private static testobjectsCopy() {

      Tx.sectionInit('copy objects');

      Tx.testExp(async (done: any) => {
         const file = new File(new Bucket(new Storage(), 'bname'), 'fname');
         this.sandbox.stub(Acl.prototype, 'add').resolves();
         this.sandbox.stub(Bucket.prototype, 'getFiles').resolves(
            [[file, file, file], {}, { nextPageToken: undefined }]);
         const fileCopyStub = this.sandbox.stub(File.prototype, 'copy');
         fileCopyStub.resolves();
         await this.gcsStorage.copy('ba', 'prefix-a', 'bb', 'prefix-b', 'email');
         Tx.checkTrue(fileCopyStub.calledThrice, done);
      });

      Tx.testExp(async (done: any) => {
         const file = new File(new Bucket(new Storage(), 'bname'), 'fname');
         this.sandbox.stub(Acl.prototype, 'add').resolves();
         const getFilesStub = this.sandbox.stub(Bucket.prototype, 'getFiles');
         getFilesStub.onCall(0).resolves([[file, file, file], {}, { nextPageToken: 'next-token-1' }]);
         getFilesStub.onCall(1).resolves([[file, file, file], {}, { nextPageToken: 'next-token-2' }]);
         getFilesStub.onCall(2).resolves([[file, file, file], {}, { nextPageToken: undefined }]);

         const fileCopyStub = this.sandbox.stub(File.prototype, 'copy');
         fileCopyStub.resolves();
         await this.gcsStorage.copy('ba', 'prefix-a', 'bb', 'prefix-b', 'email');
         Tx.checkTrue(fileCopyStub.callCount === 9, done);
      });
   }

   private static testgetSubprojectPath() {

      Tx.sectionInit('copy objects');

      Tx.testExp(async (done: any) => {
         const file = new File(new Bucket(new Storage(), 'bname'), 'fname');
         this.sandbox.stub(Acl.prototype, 'add').resolves();
         this.sandbox.stub(Bucket.prototype, 'getFiles').resolves(
            [[file, file, file], {}, { nextPageToken: undefined }]);
         const fileCopyStub = this.sandbox.stub(File.prototype, 'copy');
         fileCopyStub.resolves();
         await this.gcsStorage.copy('ba', 'prefix-a', 'bb', 'prefix-b', 'email');
         Tx.checkTrue(fileCopyStub.calledThrice, done);
      });
   }
}
