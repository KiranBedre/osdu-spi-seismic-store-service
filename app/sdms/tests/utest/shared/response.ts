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

import { Response as expResponse } from 'express';
import { Config } from '../../../src/cloud';
import { Response } from '../../../src/shared/response';
import { Feature, FeatureFlags } from '../../../src/shared/featureflags';
import { Tx } from '../utils';

import sinon from 'sinon';
import xssfilters from 'xss-filters';

class TestStatusExpress {
   public send(obj: any) { return obj; }
}

class TestRESExpress {
   public locals: any = {
      trace: {
         flush: () => undefined,
      },
   };

   public set(data) {
      return this;
   }
   public get(data) {
      return '';
   }
   public status(code: number) {
      return new TestStatusExpress();
   }
}

export class TestResponseSHD {

   public static run() {

      describe(Tx.testInit('seismic store shared response test'), () => {

         beforeEach(() => { Config.CLOUDPROVIDER = 'google';
                           this.sandbox = sinon.createSandbox();
                            this.sandbox.stub(Response, 'writeMetric').returns()});
         afterEach(() => { this.sandbox.restore(); });
         this.testWriteOK();
         this.testWriteError();
         this.writeMetric();
         this.write();

      });

   }

   private static sandbox: sinon.SinonSandbox;

   private static testWriteOK() {
      Tx.sectionInit('Response writeOK');

      Tx.testExp(() => {

         const spy = this.sandbox.spy(TestRESExpress.prototype, 'set');
         const expRes = (new TestRESExpress() as unknown) as expResponse;
         Response.writeOK(expRes, { data: 'data' });

         const result = spy.calledWith({
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Expires': '0',
            'Service-Provider': Config.CLOUDPROVIDER,
            'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
            'X-Content-Type-Options': 'nosniff',
            'X-Frame-Options': 'DENY',
            'X-XSS-Protection': '1',
         });
         Tx.checkTrue(result);
      });

      Tx.testExp(() => {

         const spy = this.sandbox.spy(TestRESExpress.prototype, 'status');
         const expRes = (new TestRESExpress() as unknown) as expResponse;

         Response.writeOK(expRes, { data: 'data' });

         const result = spy.calledWith(200);
         Tx.checkTrue(result);
      });

      Tx.testExp(() => {

         const spy = this.sandbox.spy(TestStatusExpress.prototype, 'send');
         const expRes = (new TestRESExpress() as unknown) as expResponse;

         const data = {
            dataset: 'ds01',
            subproject: 'subproject',
            tenant: 'tenant',
         };

         Response.writeOK(expRes, data);

         const result = spy.calledWith(JSON.parse(xssfilters.inHTMLData(JSON.stringify(data))));
         Tx.checkTrue(result);
      });

      Tx.testExp(() => {

         const spy = this.sandbox.spy(TestStatusExpress.prototype, 'send');
         const expRes = (new TestRESExpress() as unknown) as expResponse;

         const data = {
            input: '<div class="html" ondblclick="do()" onmousedown="handleEvent()">something...</div>',
         };

         Response.writeOK(expRes, data);

         const convertedData = {
            input: '&lt;div class="html" ondblclick="do()" onmousedown="handleEvent()">something...&lt;/div>',
         };

         const result = spy.calledWith(JSON.parse(JSON.stringify(convertedData)));
         Tx.checkTrue(result);
      });
   }

   private static testWriteError() {
      Tx.sectionInit('Response writeError');

      Tx.testExp(() => {
         const expRes = (new TestRESExpress() as unknown) as expResponse;
         const spy = this.sandbox.spy(Response, 'write');

         Response.writeError(expRes, {
            error: {
               code: 402,
               message: 'error message',
            },
         });

         Tx.checkTrue(spy.calledWith(expRes, 402, 'error message'));

      });

      Tx.testExp(() => {
         const expRes = (new TestRESExpress() as unknown) as expResponse;
         const spy = this.sandbox.spy(Response, 'write');

         Response.writeError(expRes, {
            code: 403,
            message: 'error message',
         });

         Tx.checkTrue(spy.calledWith(expRes, 403, 'error message'));

      });
      
      Tx.testExp(() => {
         const expRes = (new TestRESExpress() as unknown) as expResponse;
         const spy = this.sandbox.spy(Response, 'write');

         Response.writeError(expRes, {
            code: 10,
            message: 'error message',
         });

         Tx.checkFalse(spy.calledWith(expRes, 10, 'error message'));

      });

      Tx.testExp(() => {
         const expRes = (new TestRESExpress() as unknown) as expResponse;
         const spy = this.sandbox.spy(Response, 'write');

         Response.writeError(expRes, undefined);

         Tx.checkTrue(spy.calledWith(expRes, 500, 'Internal Server Error'));

      });

      Tx.testExp(() => {
         const expRes = (new TestRESExpress() as unknown) as expResponse;
         this.sandbox.stub(FeatureFlags, 'isEnabled').resolves(true);

         Response.writeError(expRes, 'err');
         // Tx.checkTrue(spy.calledWith(expRes, 500, 'Internal Server Error'));

      });

      Tx.testExp(() => {
         const expRes = (new TestRESExpress() as unknown) as expResponse;
         this.sandbox.stub(FeatureFlags, 'isEnabled').resolves(true);

         Response.writeError(expRes, '');
         // Tx.checkTrue(spy.calledWith(expRes, 500, 'Internal Server Error'));

      });

   }

   private static writeMetric() {
      Tx.sectionInit('Response writeOK');

      Tx.testExp(() => {
         // this.sandbox.stub(FeatureFlags, 'isEnabled').returns(true);
         Response.writeMetric('key', 'val');
      });
   }

   private static write() {
      Tx.sectionInit('Response writeOK');

      Tx.testExp(() => {
         const expRes = (new TestRESExpress() as unknown) as expResponse;

         // this.sandbox.stub(FeatureFlags, 'isEnabled').returns(true);
         Response.write(expRes, 500);
      });
   }

}
