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
import { Locker } from '../../../../src/services/dataset/locker';
import { Tx } from '../../utils';

export class DataLockerTest {

    private static sandbox: sinon.SinonSandbox;
    private static locker: Locker;

    public static run() {

        describe(Tx.testInit('general', true), () => {

            beforeEach(async () => {
                this.sandbox = sinon.createSandbox();
                this.locker = new Locker();
                await this.locker.init();
            });

            afterEach(() => { 
                this.sandbox.restore(); 
            });

            this.testcreateWriteLock();
            this.testacquireWriteLock();
            this.testacquireReadLock();
            this.testunlock();
            this.testunlockReadLockSession();

        });

    }

    private static testcreateWriteLock() {

        Tx.sectionInit("test create WriteLock");

        Tx.test(async () => {
            this.locker.createWriteLock("lockKey", "lock");
        });

        Tx.test(async () => {
            this.sandbox.stub(Locker.prototype, 'getLock');
            this.locker.createWriteLock("lockKey", "lock");
        });

        Tx.test(async () => {
            this.sandbox.stub(Locker.prototype, 'getLock');
            this.locker.createWriteLock("lockKey", "idempotentWriteLock");
        });
    }

    private static testacquireWriteLock() {

        Tx.sectionInit("test acquire WriteLock");

        Tx.test(async () => {
            try {
                await this.locker.acquireWriteLock("lockKey", "acquireWriteLock");
            } catch(e) { }
        });

        Tx.test(async () => {
            
            this.sandbox.stub(Locker.prototype, 'acquireMutex').resolves();
            this.sandbox.stub(Locker.prototype, 'getLock').resolves();

            await this.locker.acquireWriteLock("lockKey", "WacquireWriteLock");
        });

        Tx.test(async () => {
            
            this.sandbox.stub(Locker.prototype, 'acquireMutex').resolves();
            this.sandbox.stub(Locker.prototype, 'getLock').resolves("WacquireWriteLock");

            await this.locker.acquireWriteLock("lockKey", "WacquireWriteLock");
        });

        Tx.test(async () => {
            
            this.sandbox.stub(Locker.prototype, 'acquireMutex').resolves();
            this.sandbox.stub(Locker.prototype, 'getLock').resolves("acquireWriteLock");
            this.sandbox.stub(Locker.prototype, 'isWriteLock').returns(true);
            this.sandbox.stub(Locker.prototype, <any>'set').resolves();
            this.sandbox.stub(Locker.prototype, 'releaseMutex').resolves();

            try {
                await this.locker.acquireWriteLock("lockKey", "WacquireWriteLock", 'wid');
            } catch(e) { }
        });

        Tx.test(async () => {
            
            this.sandbox.stub(Locker.prototype, 'acquireMutex').resolves();
            this.sandbox.stub(Locker.prototype, 'getLock').resolves("acquireWriteLock");
            this.sandbox.stub(Locker.prototype, 'isWriteLock').returns(true);
            this.sandbox.stub(Locker.prototype, <any>'set').resolves();
            this.sandbox.stub(Locker.prototype, 'releaseMutex').resolves();

            try {
                await this.locker.acquireWriteLock("lockKey", "WacquireWriteLock");
            } catch(e) { }
        });

        Tx.test(async () => {
            
            this.sandbox.stub(Locker.prototype, 'acquireMutex').resolves();
            this.sandbox.stub(Locker.prototype, 'getLock').resolves("acquireWriteLock");
            this.sandbox.stub(Locker.prototype, 'isWriteLock').returns(false);
            this.sandbox.stub(Locker.prototype, <any>'set').resolves();
            this.sandbox.stub(Locker.prototype, 'releaseMutex').resolves();

            try {
                await this.locker.acquireWriteLock("lockKey", "WacquireWriteLock");
            } catch(e) { }
        });

        Tx.test(async () => {
            
            this.sandbox.stub(Locker.prototype, 'acquireMutex').resolves();
            this.sandbox.stub(Locker.prototype, 'getLock').resolves("acquireWriteLock");
            this.sandbox.stub(Locker.prototype, 'isWriteLock').returns(false);
            this.sandbox.stub(Locker.prototype, <any>'set').resolves();
            this.sandbox.stub(Locker.prototype, 'releaseMutex').resolves();

            try {
                await this.locker.acquireWriteLock("lockKey", "WacquireWriteLock", 'wid');
            } catch(e) { }
        });
    }

    private static testacquireReadLock() {
        Tx.sectionInit("test acquire ReadLock");

        Tx.test(async () => {
            try {
                await this.locker.acquireReadLock("lockKey", "idempotentReadLock");
            } catch(e) { }
        });

        Tx.test(async () => {

            this.sandbox.stub(Locker.prototype, 'acquireMutex').resolves();
            try {
                await this.locker.acquireReadLock("lockKey");
            } catch(e) { }
        });

        Tx.test(async () => {

            this.sandbox.stub(Locker.prototype, 'acquireMutex').resolves();
            try {
                await this.locker.acquireReadLock("lockKey", "", "wid");
            } catch(e) { }
        });

        Tx.test(async () => {

            this.sandbox.stub(Locker.prototype, 'acquireMutex').resolves();
            this.sandbox.stub(Locker.prototype, 'getLock').resolves("lockValue-a");

            await this.locker.acquireReadLock("lockKey", "", "lockValue-a");
        });

        Tx.test(async () => {

            this.sandbox.stub(Locker.prototype, 'acquireMutex').resolves();
            this.sandbox.stub(Locker.prototype, 'isWriteLock').returns(false);
            this.sandbox.stub(Locker.prototype, 'getLock').resolves("lockValue-a");

            await this.locker.acquireReadLock("lockKey", "", "lockValue-a");
        });

        Tx.test(async () => {

            this.sandbox.stub(Locker.prototype, 'acquireMutex').resolves();
            this.sandbox.stub(Locker.prototype, 'isWriteLock').returns(false);
            this.sandbox.stub(Locker.prototype, 'getLock').resolves(["lockValue-a"]);

            try {
                await this.locker.acquireReadLock("lockKey", "", "wid");
            } catch(e) { }
        });

        Tx.test(async () => {

            this.sandbox.stub(Locker.prototype, 'acquireMutex').resolves();
            this.sandbox.stub(Locker.prototype, 'isWriteLock').returns(false);
            this.sandbox.stub(Locker.prototype, 'getLock').resolves();

            try {
                await this.locker.acquireReadLock("lockKey", "", "wid");
            } catch(e) { }
        });

        Tx.test(async () => {

            this.sandbox.stub(Locker.prototype, 'acquireMutex').resolves();
            this.sandbox.stub(Locker.prototype, 'isWriteLock').returns(false);
            this.sandbox.stub(Locker.prototype, 'getLock').resolves();

            try {
                await this.locker.acquireReadLock("lockKey");
            } catch(e) { }
        });

        Tx.test(async () => {

            this.sandbox.stub(Locker.prototype, 'acquireMutex').resolves();
            this.sandbox.stub(Locker.prototype, 'isWriteLock').returns(false);
            this.sandbox.stub(Locker.prototype, 'getLock').resolves(["lockValue-a"]);

            try {
                await this.locker.acquireReadLock("lockKey");
            } catch(e) { }
        });
        
    }

    private static testunlock() {

        Tx.sectionInit("test unlock");

        Tx.test(async () => {

            this.sandbox.stub(Locker.prototype, 'acquireMutex').resolves();
            this.sandbox.stub(Locker.prototype, 'getLock').resolves(["lockValue-a"]);
            this.locker.unlock("lockKey");
        });

        Tx.test(async () => {

            this.sandbox.stub(Locker.prototype, 'acquireMutex').resolves();
            this.sandbox.stub(Locker.prototype, 'isWriteLock').returns(true);
            this.sandbox.stub(Locker.prototype, 'getLock').resolves(["lockValue-a"]);
            try {
                this.locker.unlock("lockKey", 'wid');
            } catch (e) { return; } // ignore exceptions
            
        });

        Tx.test(async () => {

            this.sandbox.stub(Locker.prototype, 'acquireMutex').resolves();
            this.sandbox.stub(Locker.prototype, 'isWriteLock').returns(true);
            this.sandbox.stub(Locker.prototype, 'getLock').resolves("lockValue-a");
            try {
                this.locker.unlock("lockKey", 'lockValue-a');
            } catch (e) { return; } // ignore exceptions
            
        });

        Tx.test(async () => {

            this.sandbox.stub(Locker.prototype, 'acquireMutex').resolves();
            this.sandbox.stub(Locker.prototype, 'getLock').resolves(["lockValue-a"]);
            this.locker.unlock("lockKey", 'wid');
        });

        Tx.test(async () => {

            this.sandbox.stub(Locker.prototype, 'acquireMutex').resolves();
            this.sandbox.stub(Locker.prototype, 'getLock').resolves();
            this.locker.unlock("lockKey", 'wid');
        });

        Tx.test(async () => {

            this.sandbox.stub(Locker.prototype, 'acquireMutex').resolves();
            this.sandbox.stub(Locker.prototype, 'getLock').resolves();
            this.locker.unlock("lockKey");
        });

        Tx.test(async () => {

            this.sandbox.stub(Locker.prototype, 'acquireMutex').resolves();
            this.sandbox.stub(Locker.prototype, 'getLock').resolves(["lockValue"]);
            this.locker.unlock("lockKey", "lockValue");
        });

    }

    private static testunlockReadLockSession() {

        Tx.sectionInit("test unlock Read Lock Session");

        Tx.test(async () => {

            this.sandbox.stub(Locker.prototype, 'acquireMutex').resolves();
            this.sandbox.stub(Locker.prototype, 'isWriteLock').returns(false);
            this.sandbox.stub(Locker.prototype, 'getLock').resolves(["wid"]);
            this.locker.unlockReadLockSession("lockKey", "wid");
        });

        Tx.test(async () => {

            this.sandbox.stub(Locker.prototype, 'acquireMutex').resolves();
            this.sandbox.stub(Locker.prototype, 'isWriteLock').returns(false);
            this.sandbox.stub(Locker.prototype, 'getLock').resolves(["wid-a"]);
            this.locker.unlockReadLockSession("lockKey", "wid-b");
        });

        Tx.test(async () => {

            this.sandbox.stub(Locker.prototype, 'acquireMutex').resolves();
            this.sandbox.stub(Locker.prototype, 'isWriteLock').returns(true);
            this.sandbox.stub(Locker.prototype, 'getLock').resolves(["wid"]);
            this.locker.unlockReadLockSession("lockKey", "wid");
        });

    }
}
