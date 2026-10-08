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

import { Error } from '../../../src/shared/error';
import axios from 'axios';
import sinon from 'sinon';
import { Tx } from '../utils';

export class TestErrorSHD {

   public static run() {


      describe(Tx.testInit('seismic store shared error test'), () => {

         beforeEach(() => { this.sandbox = sinon.createSandbox();
            const myobj = new Error(); });
         afterEach(() => { this.sandbox.restore(); });

         this.testMake();
         this.testMakeForHttpRequest();
         this.get423WriteLockReason();
         this.get423ReadLockReason();
         this.get423CannotLockReason();
         this.get423CannotUnlockReason();

      });

   }

   private static sandbox: sinon.SinonSandbox;

   private static testMake() {
      Tx.sectionInit('make');

      Tx.test(() => {
         const result = Error.make(500, 'message', 'mexprefix');
         Tx.checkTrue(result.error.code === 500 && result.error.message === 'mexprefix message'
            && result.error.status === 'UNKNOWN');

      });

      Tx.test(() => {
         const result = Error.make(409, 'message', 'mexprefix');
         Tx.checkTrue(result.error.code === 409 && result.error.message === 'mexprefix message'
            && result.error.status === 'ALREADY_EXISTS');

      });

      Tx.test(() => {
         const result = Error.make(423, 'message', 'mexprefix');
         Tx.checkTrue(result.error.code === 423 && result.error.message === 'mexprefix message'
            && result.error.status === 'LOCKED');

      });

      Tx.test(() => {
         const result = Error.make(404, 'message', 'mexprefix');
         Tx.checkTrue(result.error.code === 404 && result.error.message === 'mexprefix message'
            && result.error.status === 'NOT_FOUND');

      });

      Tx.test(() => {
         const result = Error.make(403, 'message', 'mexprefix');
         Tx.checkTrue(result.error.code === 403 && result.error.message === 'mexprefix message'
            && result.error.status === 'PERMISSION_DENIED');
      });

      Tx.test(() => {
         const result = Error.make(401, 'message', 'mexprefix');
         Tx.checkTrue(result.error.code === 401 && result.error.message === 'mexprefix message'
            && result.error.status === 'UNAUTHENTICATED');
      });

   }

   private static testMakeForHttpRequest() {

      Tx.sectionInit('testMakeForHttpRequest');

      Tx.test(() => {
         const result = Error.makeForHTTPRequest({
            error: 'error',
            message: 'error',
            name: 'StatusCodeError',
            statusCode: 402,
         });
         Tx.checkTrue(result.error.code === 402 &&
            result.error.message === '[seismic-store-service] error' &&
            result.error.status === 'UNKNOWN');
      });

      Tx.test(() => {
         const result = Error.makeForHTTPRequest({
            error: 'error',
            message: 'error',
            name: 'StatusCodeError'
         });
         //
         Tx.checkTrue(result[0] === undefined);

      });

      Tx.test(() => {
         const result = Error.makeForHTTPRequest({
            error: {} as object,
            message: 'error',
            name: 'StatusCodeError'
         });
         Tx.checkTrue(result[0] === undefined);

      });

      Tx.test(() => {
         this.sandbox.stub(axios, 'isAxiosError').resolves(true);
         this.sandbox.stub(Error, 'make').resolves();

         const result = Error.makeForHTTPRequest({
            error: 'error',
            response: {
               status: 'status',
               statusText: 'statusText'},
            message: 'error',
            name: 'StatusCodeError',
            statusCode: 402,
         });
         
         Tx.checkTrue(result[0] === undefined);

         
      });
   }

   private static get423WriteLockReason() {

      Tx.sectionInit('get423WriteLockReason');
      Tx.test(() => {
         this.sandbox.stub(Error, <any>'create423Reason').resolves();
         const result = Error.get423WriteLockReason();
         Tx.checkTrue(result[0] === undefined);
      });

   }

   private static get423ReadLockReason() {

      Tx.sectionInit('get423ReadLockReason');
      Tx.test(() => {
         this.sandbox.stub(Error, <any>'create423Reason').resolves();
         const result = Error.get423ReadLockReason();
         Tx.checkTrue(result[0] === undefined);
      });

   }

   private static get423CannotLockReason() {

      Tx.sectionInit('get423CannotLockReason');
      Tx.test(() => {
         this.sandbox.stub(Error, <any>'create423Reason').resolves();
         const result = Error.get423CannotLockReason();
         Tx.checkTrue(result[0] === undefined);
      });

   }

   private static get423CannotUnlockReason() {

      Tx.sectionInit('get423CannotUnlockReason');
      Tx.test(() => {
         this.sandbox.stub(Error, <any>'create423Reason').resolves();
         const result = Error.get423CannotUnlockReason();
         Tx.checkTrue(result[0] === undefined);
      }); 

   }
}
