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

import { SDPath } from '../../../src/shared';
import { ISDPathModel } from '../../../src/shared/sdpath';
import { Tx } from '../utils';

export class TestSDPathSHD {

   public static run() {

      describe(Tx.testInit('seismic store shared sdpath test'), () => {
         this.testGetFromString();
      });
   }

   private static testGetFromString() {
      Tx.sectionInit('sdpath getfromstring');

      Tx.testExp(() => {
         const sdpath = SDPath.getFromString('sd://tnx01/spx01/a/b/c/ds01');
         const expectedResult: ISDPathModel = {
            dataset: 'ds01',
            path: '/a/b/c/',
            subproject: 'spx01',
            tenant: 'tnx01',
         };

         Tx.checkTrue(JSON.stringify(sdpath) === JSON.stringify(expectedResult));
      });

      Tx.testExp(() => {
         const sdpath = SDPath.getFromString('sd://tnx01/spx01/ds01');
         const expectedResult: ISDPathModel = {
            dataset: 'ds01',
            path: '/',
            subproject: 'spx01',
            tenant: 'tnx01',
         };

         Tx.checkTrue(JSON.stringify(sdpath) === JSON.stringify(expectedResult));
      });

      Tx.testExp(() => {
         const sdpath = SDPath.getFromString('sd://tnx01/spx01');
         const expectedResult: ISDPathModel = {
            dataset: undefined,
            path: undefined,
            subproject: 'spx01',
            tenant: 'tnx01',
         };

         Tx.checkTrue(JSON.stringify(sdpath) === JSON.stringify(expectedResult));
      });

      Tx.testExp(() => {
         const sdpath = SDPath.getFromString('sd://tnx01/spx01/');
         const expectedResult: ISDPathModel = {
            dataset: undefined,
            path: undefined,
            subproject: 'spx01',
            tenant: 'tnx01',
         };

         Tx.checkTrue(JSON.stringify(sdpath) === JSON.stringify(expectedResult));
      });
   }

}
