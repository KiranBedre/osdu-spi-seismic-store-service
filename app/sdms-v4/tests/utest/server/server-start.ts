// Copyright © Amazon Web Services
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
// see the License for the specific language governing permissions and
// limitations under the License.

import { expect } from 'chai';
import sinon from 'sinon';

import { Utils } from '../../../src/shared/utils';
import { startServerAndResolveSwaggerInBackground } from '../../../src/server/server-start';
import { Tx } from '../utils';

// Locks the BIND-FIRST startup ordering: the port must be bound before (and independently of) swagger
// resolution. A degraded community.opengroup.org once hung resolution ~169s on the bind path and blew
// the 155s startupProbe, crashlooping the pod. This test stubs Utils.resolveJsonReferences with a
// never-settling promise; if anyone re-introduces an `await` on the resolver ahead of server.start(),
// the bind would never fire under a hang and this test fails.
export class TestServerStartOrdering {
    private static sandbox: sinon.SinonSandbox;

    public static run() {
        describe(Tx.title('utest seismic store - server start bind-first ordering'), () => {
            beforeEach(() => {
                this.sandbox = sinon.createSandbox();
            });

            afterEach(() => {
                this.sandbox.restore();
            });

            it('binds the port before swagger resolution settles (resolution is off the bind path)', async () => {
                // Never settles - models a hung remote. If the bind path awaits this, start() is never reached.
                const resolveStub = this.sandbox
                    .stub(Utils, 'resolveJsonReferences')
                    .returns(new Promise<object>(() => undefined));

                const startSpy = this.sandbox.spy();
                const setSwaggerDocumentSpy = this.sandbox.spy();
                const fakeServer = { start: startSpy, setSwaggerDocument: setSwaggerDocumentSpy } as any;

                startServerAndResolveSwaggerInBackground(fakeServer);

                // Bind fired synchronously and resolution was kicked off - without the bind awaiting it.
                expect(startSpy.calledOnce).to.be.equal(true);
                expect(resolveStub.calledOnce).to.be.equal(true);

                // Let any pending microtasks/timers drain; the document must still NOT be injected,
                // proving injection is gated on the (never-settling) resolution while the bind is not.
                await new Promise(resolve => setImmediate(resolve));
                expect(setSwaggerDocumentSpy.called).to.be.equal(false);
            });
        });
    }
}
