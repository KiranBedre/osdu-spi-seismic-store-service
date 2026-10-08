// ============================================================================
// Copyright 2017-2026, Schlumberger, Microsoft Corporation
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

import { expect } from 'chai';
import sinon from 'sinon';
import { Config, LoggerFactory } from '../../../src/cloud';
import { lockerInstance } from '../../../src/services/dataset/locker';
import { RestoreOperationLock } from '../../../src/services/operation/restore-lock';
import { Tx } from '../utils';

export class TestRestoreOperationLock {

    private static sandbox: sinon.SinonSandbox;
    private static mockLogger: any;

    public static run() {
        describe(Tx.testInit('restore operation lock', true), () => {
            beforeEach(() => {
                this.sandbox = sinon.createSandbox();
                this.mockLogger = {
                    info: this.sandbox.stub(),
                    error: this.sandbox.stub(),
                    debug: this.sandbox.stub(),
                    metric: this.sandbox.stub(),
                    buildTraceInfo: this.sandbox.stub()
                };
                this.sandbox.stub(LoggerFactory, 'build').returns(this.mockLogger);
                this.sandbox.stub(Config, 'SDMS_RESTORE_LOCK_TTL_SECONDS').value(7200);
            });

            afterEach(() => {
                this.sandbox.restore();
            });

            this.testAcquire();
            this.testRelease();
            this.testGetHolder();
        });
    }

    private static testAcquire() {
        Tx.sectionInit('acquire');

        Tx.test(async () => {
            this.sandbox.stub(lockerInstance, 'setNX').resolves('OK');

            const result = await RestoreOperationLock.acquire('tenant-a', 'op-123');

            expect(result).to.equal(true);
        });

        Tx.test(async () => {
            this.sandbox.stub(lockerInstance, 'setNX').resolves(null);

            const result = await RestoreOperationLock.acquire('tenant-a', 'op-123');

            expect(result).to.equal(false);
        });

        Tx.test(async () => {
            const setNXStub = this.sandbox.stub(lockerInstance, 'setNX').resolves('OK');

            await RestoreOperationLock.acquire('tenant-a', 'op-123');

            sinon.assert.calledOnceWithExactly(setNXStub, 'restore-op-lock:tenant-a', 'op-123', 7200);
        });
    }

    private static testRelease() {
        Tx.sectionInit('release');

        Tx.test(async () => {
            this.sandbox.stub(lockerInstance, 'delIfMatch').resolves(true);

            const result = await RestoreOperationLock.release('tenant-a', 'op-123');

            expect(result).to.equal(true);
        });

        Tx.test(async () => {
            this.sandbox.stub(lockerInstance, 'delIfMatch').resolves(false);

            const result = await RestoreOperationLock.release('tenant-a', 'op-123');

            expect(result).to.equal(false);
        });
    }

    private static testGetHolder() {
        Tx.sectionInit('getHolder');

        Tx.test(async () => {
            this.sandbox.stub(lockerInstance, 'getLock').resolves('op-123');

            const result = await RestoreOperationLock.getHolder('tenant-a');

            expect(result).to.equal('op-123');
        });

        Tx.test(async () => {
            this.sandbox.stub(lockerInstance, 'getLock').resolves(undefined);

            const result = await RestoreOperationLock.getHolder('tenant-a');

            expect(result).to.equal(null);
        });
    }
}
