// ============================================================================
// Copyright 2017-2022, Schlumberger
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

import { Request as expRequest, Response as expResponse } from 'express';
import sinon from 'sinon';
import { Auth } from '../../../src/auth';
import { ImpersonationTokenHandler } from '../../../src/services/impersonation_token/handler';
import { ImpersonationTokenOps } from '../../../src/services/impersonation_token/optype';
import { Response } from '../../../src/shared';
import { Tx } from '../utils';


export class TestImpersonationTokenSVC {

    private static sandbox: sinon.SinonSandbox;
    
    public static userAuthExp: string;
    public static userAuthExp0: string;
    public static clientSecret: string;
    public static tokenContext: string;
    public static metadata: object;
    public static resources: object;

    public static run() {
        
        describe(Tx.testInit('impersonation_token'), () => {

            beforeEach(() => {
                this.sandbox = sinon.createSandbox();
                this.sandbox.stub(Response, 'writeMetric').returns();
            });
            afterEach(() => { this.sandbox.restore(); });

            this.metadata = { jobId: 1234 };
            this.resources = [{ readonly: true, resource: 'sd://tnx01/spx01' },{ readonly: true, false: 'sd://tnx01/spx02' }];

            this.generate();

        });

    }

    private static generate() {

        Tx.sectionInit('generate');

        Tx.testExp(async (done: any, expReq: expRequest, expRes: expResponse) => {
            expReq.headers['user-token'] = this.userAuthExp0;
            expReq.body.token = this.userAuthExp;
            expReq.body.resources = this.resources;
            expReq.body.metadata = this.metadata;
            expReq.body['refresh-url'] = 'https://httpstat.us/200';
            this.sandbox.stub(Auth, 'isAppAuthorized').resolves(undefined);
            this.sandbox.stub(Auth, 'isReadAuthorized').resolves(true);
            this.sandbox.stub(Auth, 'isWriteAuthorized').resolves(true);
            this.sandbox.stub(Auth, 'isImpersonationToken').returns(false);
            await ImpersonationTokenHandler.handler(expReq, expRes, ImpersonationTokenOps.Generate);
            done();
        });

    }

}
