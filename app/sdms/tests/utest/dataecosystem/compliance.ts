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

import axios from 'axios';
import sinon from 'sinon';
import { Config } from '../../../src/cloud';
import { google } from '../../../src/cloud/providers';
import { ConfigGoogle } from '../../../src/cloud/providers/google';
import { DESCompliance } from '../../../src/dataecosystem/compliance';
import { Tx } from '../utils';


export class TestCompliance {

   public static run() {

      describe(Tx.testInit('dataecosystem compliance'), () => {

         ConfigGoogle.DATA_PARTITION_REST_HEADER_KEY = 'data-partition-id'

         beforeEach(() => {
            this.sandbox = sinon.createSandbox();
            this.sandbox.stub(google.Credentials.prototype, 'getServiceCredentials').resolves('usertoken');

         });
         afterEach(() => { this.sandbox.restore(); });

         this.isLegalTagValid();
      });

   }

   private static sandbox: sinon.SinonSandbox;
   private static options = {
      headers: {
         'Accept': 'application/json',
         'AppKey': 'appkey',
         'Authorization': 'Bearer usertoken',
         'Content-Type': 'application/json',
         'data-partition-id': 'tenant-a',
      }
   };
   private static data = {
      names: ['ltag']
   };
   private static url = Config.DES_SERVICE_HOST_COMPLIANCE + '/legal/v1/legaltags:validate';

   private static isLegalTagValid() {
      Tx.sectionInit('legal tag validity');

      Tx.test(async () => {
         const requestStub = this.sandbox.stub(axios, 'post');
         requestStub.resolves({ status: 200, data: {
            invalidLegalTags: [],
         }});

         const result = await DESCompliance.isLegalTagValid('usertoken', 'ltag', 'tenant-a', 'appkey');

         requestStub.calledWith(this.url, this.data, this.options);
         Tx.checkTrue(result && requestStub.calledWith(this.url, this.data, this.options));

      });

      Tx.test(async () => {
         const requestStub = this.sandbox.stub(axios, 'post');
         requestStub.resolves({ status: 200, data: {
            invalidLegalTags: ['ltag'],
         }});

         const result = await DESCompliance.isLegalTagValid('usertoken', 'ltag', 'tenant-a', 'appkey');
         requestStub.calledWith(this.url, this.data, this.options);
         Tx.checkFalse(result && requestStub.calledWith(this.url, this.data, this.options));

      });

   }

}
