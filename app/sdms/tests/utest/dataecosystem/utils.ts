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

import { google } from '../../../src/cloud/providers';
import { DESUtils } from '../../../src/dataecosystem';
import { Tx } from '../utils';

export class TestDESUtils {

   public static run() {

      describe(Tx.testInit('dataecosystem utils'), () => {

         beforeEach(() => {
            this.sandbox = sinon.createSandbox();
            this.sandbox.stub(google.Credentials.prototype, 'getServiceCredentials').resolves('token');

         });
         afterEach(() => { this.sandbox.restore(); });

         this.getDataPartition();
      });

   }

   private static sandbox: sinon.SinonSandbox;

   private static getDataPartition() {
      Tx.sectionInit('get data partition');

      Tx.test(async () => {
         const result = DESUtils.getDataPartitionID('tenant.env.cloud.slb-ds.com');
         Tx.checkTrue(result === 'tenant');
      });

      Tx.test(async () => {
         try {
            DESUtils.getDataPartitionID('tenant');
         } catch (e) {
            Tx.check404(e.error.code);
         }
      });
   }
}
