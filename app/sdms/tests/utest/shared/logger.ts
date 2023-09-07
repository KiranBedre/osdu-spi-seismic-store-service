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

import { TraceLog } from '../../../src/shared';
import { Tx } from '../utils';

import sinon from 'sinon';

export class TestLoggerSHD {
   public static spy: sinon.SinonSandbox;

   public static run() {

      describe(Tx.testInit('seismic store shared logger test'), () => {

         beforeEach(() => { this.spy = sinon.createSandbox(); });
         afterEach(() => { this.spy.restore(); });

         this.testTraceLogger();

      });

   }

   private static testTraceLogger() {

      Tx.sectionInit('test trace logger');

      Tx.testExp(() => {
         const trace = new TraceLog('test trace');
         trace.start('step-a');
         trace.stop();
         trace.flush();
      });
   }

}
