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

import { Tx } from '../utils';
import { TestErrorSHD } from './error';
import { TestLoggerSHD } from './logger';
import { TestParams } from './params';
import { TestResponseSHD } from './response';
import { TestSDPathSHD } from './sdpath';
import { TestNodeCache } from './node-cache';
import { TestUtils } from './utils';

export class TestShared {

   public static run() {

      describe(Tx.testInit('seismic store services test'), () => {

         TestErrorSHD.run();
         TestLoggerSHD.run();
         TestResponseSHD.run();
         TestSDPathSHD.run();
         TestUtils.run();
         TestParams.run();
         TestNodeCache.run();
      });

   }

}
