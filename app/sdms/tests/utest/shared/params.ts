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

import { Params } from '../../../src/shared';
import { Tx } from '../utils';

import sinon from 'sinon';

export class TestParams {
   public static spy: sinon.SinonSandbox;

   public static run() {

      describe(Tx.testInit('seismic store shared logger test'), () => {

         beforeEach(() => { this.spy = sinon.createSandbox(); });
         afterEach(() => { this.spy.restore(); });

         this.checkBody();
         this.checkArray();
         this.checkEmail();
         this.checkDatasetPath();
         this.checkBoolean();

      });

   }

   private static checkBody() {
      Tx.sectionInit('check body');

      Tx.test(() => {
         const body = { 'a': 'b', 'c': 'd' };
         Params.checkBody(body, true);
      });

      // body is undefined
      Tx.test(() => {
         const body = {};
         try {
            Params.checkBody(body, true);
         } catch (e) {
            Tx.check400(e.error.code);
         }
      });

      Tx.test(() => {
         const body = {};

         const result = Params.checkBody(body, false);
         Tx.checkTrue(result === undefined);

      });

      // body is not a object
      Tx.test(() => {
         const body = 100;
         try {
            Params.checkBody(body, true);
         } catch (e) {
            Tx.check400(e.error.code);
         }
      });


      Tx.test(() => {
         const body = '';
         try {
            Params.checkBody(body, true);
         } catch (e) {
            Tx.check400(e.error.code);
         }
      });

      Tx.test(() => {
         const body = '';
         Params.checkBody(body, false);
      });
      
   }

   private static checkArray() {
      Tx.sectionInit('check array');


      Tx.test(() => {
         Params.checkArray(['100', '200'], 'array01', true);
      });

      Tx.test(() => {
         try {
            Params.checkArray('', 'array01', true);
         } catch (e) {
            Tx.check400(e.error.code);
         }
      });

      Tx.test(() => {

         const result = Params.checkArray('', 'array01', false);
         Tx.checkTrue(result === undefined);

      });

      Tx.test(() => {
         try {
            Params.checkArray(100, 'array01', true);
         } catch (e) {
            Tx.check400(e.error.code);
         }
      });
   }

   private static checkEmail() {
      Tx.sectionInit('check email');

      Tx.test(() => {
         Params.checkEmail('user@email.com', 'emailAdress', true);
      });

      Tx.test(() => {
         Params.checkEmail('', 'emailAdress', false);
      });

      Tx.test(() => {
         try {
            Params.checkEmail('invalidEmail', 'emailAdress', true);
         }
         catch (e) {
            Tx.check400(e.error.code);
         }
      });
   }

   private static checkDatasetPath() {
      Tx.sectionInit('check dataset path');

      Tx.test(() => {
         Params.checkDatasetPath('/a/b/c', 'filepath', true);
      });

      Tx.test(() => {
         try {
            Params.checkDatasetPath('@$', 'filepath', true);
         } catch (e) {
            Tx.check400(e.error.code);
         }

      });

      Tx.test(() => {
         try {
            Params.checkDatasetPath('', 'filepath', true);
         } catch (e) {
            Tx.check400(e.error.code);
         }
      });
   }

   private static checkBoolean() {
      Tx.sectionInit('check Boolean');

      Tx.test(() => {
         this.spy.stub(Params, <any>'checkParam').resolves();
         Params.checkBoolean('param', 'fieldName', true);
      });

   }

}
