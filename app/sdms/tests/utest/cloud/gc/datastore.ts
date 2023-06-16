// ============================================================================
// Copyright 2017-2023, Schlumberger
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

import { Datastore, Query, Transaction } from '@google-cloud/datastore';
import { DatastoreDAO, DatastoreTransactionDAO } from '../../../../src/cloud/providers/gc';
import { Config } from '../../../../src/cloud';
import { Tx } from '../../utils';

export class TestGCDatastoreDAO {
   private static sandbox: sinon.SinonSandbox;

   private static ds: DatastoreDAO;

   public static run() {

      describe(Tx.testInit('seismic store dao dataset test'), () => {
         beforeEach(() => {
            this.sandbox = sinon.createSandbox();
            this.ds = new DatastoreDAO({ gcpid: 'gcpid', default_acls:'x', esd: 'gcpid@domain.com', name: 'gcpid'});
            Config.CLOUDPROVIDER = 'google';
         });

         afterEach(() => {
            this.sandbox.restore();
         });

         this.save();
         this.delete();
         this.get();
         this.createQuery();
         this.runQuery();
         this.createKey();
      });

   }

   private static save() {
      Tx.sectionInit('save');

      Tx.test(async (done: any) => {
         this.sandbox.stub(Datastore.prototype, 'save').resolves();
         this.ds.save('entity');
         done();
      });
   }


   private static delete() {
      Tx.sectionInit('delete');

      Tx.test(async (done: any) => {
         this.sandbox.stub(Datastore.prototype, 'delete').resolves();
         this.ds.delete('entity');
         done();
      });
   }

   private static get() {
      Tx.sectionInit('get');

      Tx.test(async (done: any) => {
         this.sandbox.stub(Datastore.prototype, 'get').resolves();
         this.ds.get('key');
         done();
      });
   }

   private static createQuery() {
      Tx.sectionInit('create query');

      Tx.test(async (done: any) => {
         this.sandbox.stub(Datastore.prototype, 'createQuery').resolves();
         this.ds.createQuery('namespace', 'kind');
         done();
      });

   }

   private static runQuery() {
      Tx.sectionInit('run query');

      Tx.test(async (done: any) => {
         this.sandbox.stub(Datastore.prototype, 'runQuery').resolves();
         this.sandbox.stub(Datastore.prototype, 'createQuery').resolves();

         const datastore = new Datastore({ projectId: 'gcpid' });
         const query = datastore.createQuery('kind');

         this.ds.runQuery(query);
         done();
      });

   }

   private static createKey() {
      Tx.sectionInit('create Key');

   //    Tx.test(async (done: any) => {
         
   //       this.sandbox.stub()
   //       const datastore = new Datastore({ projectId: 'gcpid' });
   //       const specs = {
   //          enforcedKey: true
   //       };
   //       datastore.createKey(specs);
   //       done();
   //    });

   }
}

export class TestGCDatastoreTransactionDAO {


   private static sandbox: sinon.SinonSandbox;
   private static query: any;
   private static tdao: DatastoreTransactionDAO;
   private static datastore: Datastore;
   public static run() {

      describe(Tx.testInit('seismic store dao dataset test'), () => {
         beforeEach(() => {
            this.sandbox = sinon.createSandbox();
            this.datastore = new Datastore();
            const transaction = this.datastore.transaction();
            this.query = transaction.createQuery('kind');
            this.tdao = new DatastoreTransactionDAO(transaction);
            Config.CLOUDPROVIDER = 'google';

         });

         afterEach(() => {
            this.sandbox.restore();
         });

         this.save();
         this.delete();
         this.createQuery();
         this.runQuery();
         this.runq();
         this.rollback();
         this.commitq();
         this.getq();
      });
   }

   private static save() {

      Tx.sectionInit('save**');
      Tx.test(async (done: any) => {
         this.sandbox.stub(Transaction.prototype, 'save').resolves();
         this.tdao.save('entity');
         done();
      });
   }

   private static delete() {

      Tx.sectionInit('delete');
      Tx.test(async (done: any) => {
         this.sandbox.stub(Transaction.prototype, 'get').resolves();
         this.tdao.delete('key');
         done();
      });
   }

   private static createQuery() {

      Tx.sectionInit('create query');
      Tx.test(async (done: any) => {
         this.sandbox.stub(Transaction.prototype, 'createQuery').resolves();
         this.tdao.createQuery('namespace', 'kind');
         done();
      });
   }

   private static runQuery() {

      Tx.sectionInit('run query');
      Tx.test(async (done: any) => {
         this.sandbox.stub(Transaction.prototype, 'runQuery').resolves();
         this.tdao.runQuery(this.query as Query);
         done();
      });

   }

   private static runq() {

      Tx.sectionInit('run');
      Tx.test(async (done: any) => {
         this.sandbox.stub(Transaction.prototype, 'run').resolves();
         this.tdao.run();
         done();
      });
   }

   private static rollback() {

      Tx.sectionInit('rollback');
      Tx.test(async (done: any) => {
         this.sandbox.stub(Transaction.prototype, 'rollback').resolves();
         this.tdao.rollback();
         done();
      });
   }

   private static commitq() {

      Tx.sectionInit('commit');
      Tx.test(async (done: any) => {
         this.sandbox.stub(Transaction.prototype, 'commit').resolves();
         this.tdao.commit();
         done();
      });
   }

   private static getq() {
      Tx.sectionInit('get');
      Tx.test(async (done: any) => {
         this.sandbox.stub(Transaction.prototype, 'get').resolves();
         this.tdao.get('key');
         done();
      });

   }
}