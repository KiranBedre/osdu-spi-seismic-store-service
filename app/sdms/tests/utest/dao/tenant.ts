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

import { Datastore } from '@google-cloud/datastore';
import { Entity } from '@google-cloud/datastore/build/src/entity';
import { google, Config, JournalFactoryServiceClient } from '../../../src/cloud';
import { TenantDAO } from '../../../src/services/tenant/dao';
import { ITenantModel } from '../../../src/services/tenant/model';
import { Tx } from '../utils';
import { InMemoryCache } from '../../../src/shared/node-cache';
export class TestTenant {

   public static run() {

      TestTenant.testDb = new Datastore({ projectId: 'GoogleProjectID' });

      describe(Tx.testInit('seismic store dao tenant test'), () => {
         this.sandbox = sinon.createSandbox();
         beforeEach(() => {

            this.journal = this.sandbox.createStubInstance(google.DatastoreDAO);
            this.journal.createKey.callsFake((specs) => TestTenant.testDb.key(specs));
            this.journal.createQuery.callsFake((namespace, kind) => TestTenant.testDb.createQuery(namespace, kind));
            this.sandbox.stub(JournalFactoryServiceClient, 'get').returns(this.journal);
         });
         afterEach(() => { this.sandbox.restore(); });

         this.testGet();
         this.testGetAll();
         this.testRegister();
         this.testExist();
         this.testDelete();
      });

   }

   private static sandbox: sinon.SinonSandbox;
   private static journal: any;
   private static testDb: Datastore;

   private static testGet() {

      Tx.sectionInit('tenant get');
      Tx.test(async () => {

         this.journal.get.resolves([{
            esd: 'esd.dom',
            gcpid: 'gcpid',
            name: 'tenant-c',
         } as ITenantModel]);

         const result = await TenantDAO.get('tenant-c');
         Tx.checkTrue(result.name === 'tenant-c' && result.esd === 'esd.dom' && result.gcpid === 'gcpid');
      });
   }

   private static testGetAll() {
      Tx.sectionInit('tenant get all');
      Tx.test(async () => {

         const entity: Entity = {
            esd: 'esd', gcpid: 'gcpid', name: 'tenant-a',
         };
         // console.log(Datastore.KEY);
         entity[Datastore.KEY] = this.journal.createKey(
            { namespace: 'seismic-store-ns', path: ['tenants', 'tenant-a'] });
         
         this.journal.runQuery.resolves([[
            entity,
         ]]);

         const results = await TenantDAO.getAll();
         Tx.checkTrue(results[0].name === 'tenant-a' && results[0].esd === 'esd' && results[0].gcpid === 'gcpid');
      });

      Tx.test(async () => {

         const entity: Entity = {
            esd: 'esd', gcpid: 'gcpid', name: 'tenant-a',
         };
         // console.log(Datastore.KEY);
         entity[Datastore.KEY] = this.journal.createKey(
            { namespace: 'seismic-store-ns', path: ['tenants', 'tenant-a'] });
         
         this.journal.runQuery.resolves([[
            entity,
         ]]);

         Config.TENANT_JOURNAL_ON_DATA_PARTITION = false;

         try {
            const results = await TenantDAO.getAll();
         } catch (e) { 
         }
         // Tx.checkTrue(results[0].name === 'tenant-a' && results[0].esd === 'esd' && results[0].gcpid === 'gcpid');
      });
   }

   private static testRegister() {
      Tx.sectionInit('tenant register');
      Tx.test(async () => {
         this.journal.save.resolves();
         await TenantDAO.register({ esd: 'esd', gcpid: 'gcpid', name: 'tenant-a', default_acls: 'undefined' });
      });

   }

   private static testExist() {
      Tx.sectionInit('tenant exist');
      Tx.test(async () => {
         this.journal.get.resolves([[{ name: 'tenant-a', esd: 'esd', gcpid: 'gcpid' }]]);
         const result = await TenantDAO.exist({ name: 'tenant-a', esd: 'esd', gcpid: 'gcpid', default_acls: 'default_acls' });
         Tx.checkTrue(result);
      });

      Tx.test(async () => {
         this.sandbox.stub(InMemoryCache.prototype, 'get').resolves(undefined);
         this.journal.get.resolves([[{ name: 'tenant-a', esd: 'esd', gcpid: 'gcpid' }]]);
         const result = await TenantDAO.exist({ name: 'tenant-a', esd: 'esd', gcpid: 'gcpid', default_acls: 'default_acls' });
         Tx.checkTrue(result);
      });

   }

   private static testDelete() {
      Tx.sectionInit('tenant delete');
      Tx.test(async () => {
         this.journal.delete.resolves();
         await TenantDAO.delete('tenant');
      });

      Tx.test(async () => {
         const originalValue = Config.TENANT_JOURNAL_ON_DATA_PARTITION;
         Config.TENANT_JOURNAL_ON_DATA_PARTITION = true;
         this.journal.delete.resolves();
         await TenantDAO.delete('tenant');
         Config.TENANT_JOURNAL_ON_DATA_PARTITION = originalValue;
      });

   }

}
