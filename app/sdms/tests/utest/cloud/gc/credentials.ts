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

import { gc } from '../../../../src/cloud/providers';
import { Utils } from '../../../../src/shared';
import { Tx } from '../../utils';
import { ConfigGoogle } from '../../../../src/cloud/providers/google';

export class TestGoogleCredentials {

  public static run() {

    describe(Tx.testInit('credentials', true), () => {

      beforeEach(() => {
        this.sandbox = sinon.createSandbox();
        this.credentials = new google.Credentials();
      });
      afterEach(() => { this.sandbox.restore(); });

      this.getServiceAccountEmail();
      this.getUserStorageCredentials();
      this.getServiceCredentials();
      this.getServiceAccountAccessToken();

    });
  }

  private static sandbox: sinon.SinonSandbox;
  private static credentials: gc.Credentials;

  private static getServiceAccountEmail() {
    Tx.sectionInit('service account email');

    Tx.testExp(async (done: any) => {
      this.sandbox.stub(axios, 'get').resolves({data: 'email'});
      await this.credentials.getServiceAccountEmail();
      done();
    });

    Tx.testExp(async (done: any) => {
      this.sandbox.stub(axios, 'get').throws();
      try {
        await this.credentials.getServiceAccountEmail();
      } catch (e) {
        ConfigGoogle.SERVICE_IDENTITY_EMAIL = '';
        Tx.check500(e.error.code, done);
      }
    });

    Tx.testExp(async (done: any) => {
      ConfigGoogle.SERVICE_IDENTITY_EMAIL = 'test@email.com';
      const result = await this.credentials.getServiceAccountEmail();
      ConfigGoogle.SERVICE_IDENTITY_EMAIL = '';
      Tx.checkTrue(result === 'test@email.com', done);
    });

  }

  private static getUserStorageCredentials() {

    // [REVERT-DOWNSCOPE] re-enable this test
    // Tx.sectionInit('user credentials');

    // Tx.testExp(async (done: any) => {
    //   this.sandbox.stub(google.Credentials.prototype, 'getServiceAccountEmail').resolves('user@email');
    //   this.sandbox.stub(google.Credentials.prototype, 'getServiceAccountAccessToken').resolves({
    //     access_token: 'access_token',
    //     expires_in: 100, token_type: 'access_token',
    //   });
    //   this.sandbox.stub(request, 'post').resolves({ access_token: 'signed_jwt' });
    //   this.sandbox.stub(google.Credentials.prototype, 'signJWT').resolves(
    //     { access_token: 'signed_jwt', expires_in: 3600, token_type: 'Beare' });
    //   this.sandbox.stub(google.Credentials.prototype, 'exchangeJwtWithDownScopedAccessToken' as never).resolves({
    //     access_token: 'access_token',
    //     token_type: 'Bearer',
    //     issued_token_type: 'urn:ietf:params:oauth:token-type:access_token'
    //   });

    //   const result = await this.credentials.getStorageCredentials('bucket', false);

    //   Tx.checkTrue(
    //     result.access_token === 'access_token' &&
    //     result.expires_in === 3599 &&
    //     result.token_type === 'Bearer', done);
    // });
  }

  private static getServiceCredentials() {

    Tx.sectionInit('service credentials');

    Tx.testExp(async (done: any) => {
      this.sandbox.stub(gc.Credentials.prototype, 'getServiceAccountEmail').resolves('user@email');
      this.sandbox.stub(gc.Credentials.prototype, 'getServiceAccountAccessToken').resolves({
        access_token: 'access_token',
        expires_in: 100, token_type: 'access_token',
      });
      this.sandbox.stub(axios, 'request').resolves({ status: 200, data: { signedJwt: 'signed_jwt' }});
      this.sandbox.stub(google.Credentials.prototype, 'signJWT' as any).resolves({ id_token: 'id_token' });
      this.sandbox.stub(Utils, 'getExpTimeFromPayload').resolves(400);

      const idToken = await this.credentials.getServiceCredentials();

      Tx.checkTrue(idToken === 'id_token', done);

    });
  }

  private static getServiceAccountAccessToken() {

    Tx.sectionInit('service access token');

    Tx.testExp(async (done: any) => {
      this.sandbox.stub(axios, 'get').resolves({ status: 200, data: {
        access_token: 'acces_token',
        expires_in: 1000,
        token_type: 'token-a',
      }});

      const result = await this.credentials.getServiceAccountAccessToken();
      Tx.checkTrue(result.access_token === 'acces_token', done);
    });
  }

}
