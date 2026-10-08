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

import sinon from 'sinon';
import { GenericAuthProvider } from '../../../src/auth/providers/generic/auth';
import { ImpersonationTokenModel } from '../../../src/services/impersonation_token/model'
import { Error, ErrorModel } from '../../../src/shared';

import { Tx } from '../utils';


export class GenericAuth {

    public static run() {

        describe(Tx.testInit('generic authorization'), () => {

            beforeEach(() => {
                this.sandbox = sinon.createSandbox();
                this.provider = new GenericAuthProvider();
            });
            afterEach(() => { this.sandbox.restore(); });

            this.generateAuthCredential();
            this.generateScopedAuthCredential();
            this.convertToImpersonationTokenModel();
            this.getClientID();
            this.getClientSecret();
            this.exchangeCredentialAudience();

        });

    }

    private static sandbox: sinon.SinonSandbox;
    private static provider: GenericAuthProvider;

    private static generateAuthCredential() {

        Tx.sectionInit('generate AuthCredential');

        Tx.test(async () => {

            try {
                this.provider.generateAuthCredential();
            } catch (e) {
                Tx.check400(e.error.code); }
         });

    }
    private static generateScopedAuthCredential() {

        Tx.sectionInit('generate Scoped AuthCredential');

        Tx.test(async () => {

            try {
                const result =  this.provider.generateScopedAuthCredential([]);
            } catch (e) { 
                Tx.check501(e.error.code); }
        }); 

    }
    private static convertToImpersonationTokenModel() {

        Tx.sectionInit('convert To Impersonation TokenModel');

        Tx.test(async () => {

            // this.sandbox.stub(this.provider, 'convertToImpersonationTokenModel').throws();
            try {
                this.provider.convertToImpersonationTokenModel('credential-a');
            } catch (e) { 
                Tx.check501(e.error.code); }
        });

    }
    private static getClientID() {

        Tx.sectionInit('get ClientID');

        Tx.test(async () => {
            try {
                this.provider.getClientID();
            } catch (e) {
                Tx.check501(e.error.code); }
        }); 

    }
    private static getClientSecret() {

        Tx.sectionInit('getClientSecret');

        Tx.sectionInit('get ClientID');

        Tx.test(async () => {
            try {
                this.provider.getClientSecret();
            } catch (e) { 
                Tx.check501(e.error.code); }
        });
        
    }
    private static exchangeCredentialAudience() {

        Tx.sectionInit('exchangeCredentialAudience');

        Tx.test(async () => {
            try {
                this.provider.exchangeCredentialAudience('credential', 'audience');
            } catch (e) { 
                Tx.check501(e.error.code); }
        });

    }


}
