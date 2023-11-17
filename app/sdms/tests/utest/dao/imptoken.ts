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

import jsonwebtoken from 'jsonwebtoken';
import axios from 'axios';
import sinon from 'sinon';
import { Config } from '../../../src/cloud';
import { google } from '../../../src/cloud/providers';
import { ImpTokenDAO } from '../../../src/services/imptoken';
import { IResourceModel } from '../../../src/services/imptoken/model';
import { Tx } from '../utils';


export class TestImpToken {

   public static run() {

      describe(Tx.testInit('seismic store dao imptoken test'), () => {

         beforeEach(() => {
            this.sandbox = sinon.createSandbox();
            this.sandbox.define(Config, 'IMP_SERVICE_ACCOUNT_SIGNER', 'signer@seistore.com');
         });
         afterEach(() => { this.sandbox.restore(); });

         this.testCreate();
         this.testCanBeRefreshed();
         this.getImpTokenBody();
         this.validate();

      });
   }
   private static sandbox: sinon.SinonSandbox;

   private static testCreate() {
      Tx.sectionInit('create');

      // Tx.test(async () => {
      //    this.sandbox.stub(google.Credentials.prototype, 'getServiceAccountAccessToken').resolves(
      //       { access_token: 'access_token', expires_in: 100, token_type: 'token' });
      //    this.sandbox.stub(axios, 'post').resolves(JSON.stringify({ signedJwt: 'signed_jwt' }));
      //    const result = await ImpTokenDAO.create({
      //       iat: 100,
      //       refreshUrl: 'refresh-url',
      //       resources: [
      //          {
      //             readonly: false,
      //             resource: 'resource-a',
      //          } as IResourceModel,
      //       ],
      //       user: 'user-a',
      //       userToken: 'user_token',

      //    });
      //
      //    Tx.checkTrue(result.impersonation_token === 'signed_jwt');
      // });

      Tx.test(async () => {
         this.sandbox.stub(google.Credentials.prototype, 'getServiceAccountAccessToken').resolves(
            { access_token: 'access_token', expires_in: 100, token_type: 'token' });
         this.sandbox.stub(axios, 'post').throws();

         try {
            await ImpTokenDAO.create({
               iat: 100,
               refreshUrl: 'refresh-url',
               resources: [
                  {
                     readonly: false,
                     resource: 'resource-a',
                  } as IResourceModel,
               ],
               user: 'user-a',
               userToken: 'user_token',

            });
         } catch (error) {
            Tx.check500(error.error.code);
         }
      });
   }

   private static testCanBeRefreshed() {
      Tx.sectionInit('can be refreshed');

      Tx.test(async () => {
         this.sandbox.stub(axios, 'get').resolves();
         await ImpTokenDAO.canBeRefreshed('https://google.com');
      });

      Tx.test(async () => {
         this.sandbox.stub(axios, 'get').throws();
         try {
            // await ImpTokenDAO.canBeRefreshed('https://refresh-url');
            await ImpTokenDAO.canBeRefreshed('https://google.com');
         } catch (e) {
            Tx.check400(e.error.code);
         }
      });
   }

   private static getImpTokenBody() {
      Tx.sectionInit('get imptoken body');

      Tx.test(async () => {
         const result = await ImpTokenDAO.getImpTokenBody
            ('Bearer ya.eyAiaWF0IjogImlhdCIsInJ1cmwiOiAicnVybCIsICJyc3JjIjogInJzcmMiLCJvYm8iOiAib2JvIn0=');
         Tx.checkTrue(result.iat.toString() === 'iat' && result.refreshUrl === 'rurl');
      });
   }

   private static validate() {
      Tx.sectionInit('validate');

      // Tx.test(async () => {

      //    this.sandbox.stub(jsonwebtoken, 'decode').returns({ header: { kid: 'kid' } });
      //    this.sandbox.stub(axios, 'get').resolves(JSON.stringify({ kid: 'public_key' }));
      //    this.sandbox.stub(jsonwebtoken, 'verify').returns(
      //       {
      //          iss: Config.IMP_SERVICE_ACCOUNT_SIGNER,
      //          obo: 'user-a',
      //          rsrc: [{ resource: 'resource', readonly: true }],
      //          rurl: 'rurl',
      //       } as any);
      //    const result = await ImpTokenDAO.validate('token');
      //    Tx.checkTrue(result.user === 'user-a' && result.refreshUrl === 'rurl');

      // });

      // Tx.test(async () => {
      //    try {
      //       this.sandbox.stub(axios, 'get').throws();
      //       await ImpTokenDAO.validate('token');
      //    } catch (e) {
      //       Tx.check500(e.error.code);
      //    }
      // });

      // Tx.test(async () => {

      //    this.sandbox.stub(jsonwebtoken, 'decode').throws();
      //    this.sandbox.stub(axios, 'get').resolves(JSON.stringify({ kid: 'public_key' }));
      //    try {
      //       await ImpTokenDAO.validate('token');
      //    } catch (e) {
      //       Tx.check400(e.error.code);
      //    }
      // });

      // Tx.test(async () => {

      //    this.sandbox.stub(jsonwebtoken, 'decode').returns({ header: { kid: 'kid' } });
      //    this.sandbox.stub(axios, 'get').resolves(JSON.stringify({ kid: 'public_key' }));
      //    this.sandbox.stub(jsonwebtoken, 'verify').throws();
      //    try {
      //       await ImpTokenDAO.validate('token');
      //    } catch (e) {
      //       Tx.check400(e.error.code);
      //    }
      // });

      // Tx.test(async () => {

      //    this.sandbox.stub(jsonwebtoken, 'decode').returns({ header: { kid: 'kid' } });
      //    this.sandbox.stub(axios, 'get').resolves(JSON.stringify({ kid: 'public_key' }));
      //    this.sandbox.stub(jsonwebtoken, 'verify').returns(
      //       {
      //          iss: Config.IMP_SERVICE_ACCOUNT_SIGNER,
      //       } as any);
      //    try {
      //       await ImpTokenDAO.validate('token');
      //    } catch (e) {
      //       Tx.check400(e.error.code);
      //    }
      // });

   }

}
