// // ============================================================================
// // Copyright 2017-2023, Schlumberger
// //
// // Licensed under the Apache License, Version 2.0 (the "License");
// // you may not use this file except in compliance with the License.
// // You may obtain a copy of the License at
// //
// //      http://www.apache.org/licenses/LICENSE-2.0
// //
// // Unless required by applicable law or agreed to in writing, software
// // distributed under the License is distributed on an "AS IS" BASIS,
// // WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// // See the License for the specific language governing permissions and
// // limitations under the License.
// // ============================================================================

import redis from 'ioredis-mock';
import Redlock from 'redlock';
import sinon from 'sinon';
import { google, JournalFactoryTenantClient } from '../../../src/cloud';
import { DatasetDAO, DatasetModel } from '../../../src/services/dataset';
import { Locker } from '../../../src/services/dataset/locker';
import { Tx } from '../utils';


export class TestLocker {
	public static run() {
		describe(Tx.testInit('LOCKER'), () => {
			beforeEach(() => {
				this.sandbox = sinon.createSandbox();
				this.dataset = {
					name: 'dataset01',
					path: '/', subproject: 'subproject', tenant: 'tenant'
				} as DatasetModel;
				this.writeLockValueInCache = 'WAxAMSFEssarGGERGEG';
				this.multiSessionReadLockValueInCache = 'rms:RAxAMSFEssarGGERGEG:RAxAMSCLaMGBERGEG';
				this.redisClient = new redis();
				this.datasetKey = this.dataset.tenant + '/' + this.dataset.subproject + this.dataset.path + this.dataset.name;
				this.sampleRedlock = {
					redlock: 'redlock',
					resource: this.datasetKey,
					value: 'random_value',
					ttl: 100,
				};
				this.journal = this.sandbox.createStubInstance(google.DatastoreDAO);

				this.sandbox.stub(JournalFactoryTenantClient, 'get').returns(this.journal);

			});
			afterEach(() => {
				this.sandbox.restore();
				this.redisClient.flushall();
			});
			// this.testIsWriteLock();
			// this.testGetLock();
			// this.testDeleteLock();
			// this.testCreateWriteLock();
			// this.testAcquireWriteLock();
			// this.testAcquireReadLock();
			// this.testUnlock();
			// this.testUnlockReadLockSession();
			// this.acquireMutex();
			// this.releaseMutex();

		});
	}

	private static sandbox: sinon.SinonSandbox;

	private static dataset: DatasetModel;
	private static writeLockValueInCache;
	private static multiSessionReadLockValueInCache;
	private static redisClient: any;
	private static datasetKey: string;
	private static sampleRedlock: object;
	private static journal: any;


	// private static testIsWriteLock() {
	// 	Tx.sectionInit('is write lock');

	// 	Tx.test(() => {
	// 		const result = Locker.isWriteLock(this.writeLockValueInCache);
	// 		Tx.checkTrue(result);
	// 	});

	// 	Tx.test(() => {
	// 		const result = Locker.isWriteLock(this.writeLockValueInCache);
	// 		Tx.checkTrue(result);
	// 	});

	// 	Tx.test(() => {
	// 		const result = Locker.isWriteLock(['RAxAMSFEssarGGERGEG']);
	// 		Tx.checkFalse(result);
	// 	});
	// }

	// private static testGetLock() {
	// 	Tx.sectionInit('get lock');

	// 	Tx.test(async () => {
	// 		this.sandbox.stub(Locker, 'get' as any).resolves(this.writeLockValueInCache);
	// 		const result = await Locker.getLock(this.datasetKey);
	// 		Tx.checkTrue(result === this.writeLockValueInCache);
	// 	});
	// }

	// private static testDeleteLock() {
	// 	Tx.sectionInit('delete lock ');

	// 	// Tx.test(async () => {
	// 	// 	this.redisClient.set(this.datasetKey, this.writeLockValueInCache);
	// 	// 	const result = await Locker.del(this.datasetKey);
	// 	// 	Tx.checkTrue(result === 1);
	// 	// });
	// }

	// private static testCreateWriteLock() {
	// 	Tx.sectionInit('create write lock');

	// 	// Tx.test(async () => {
	// 	// 	this.sandbox.stub(Redlock.prototype, 'lock').resolves();

	// 	// 	await Locker.createWriteLock(this.datasetKey, 'Wx123');

	// 	// 	this.redisClient.get(this.datasetKey, (err, response) => {
	// 	// 		Tx.checkTrue('Wx123' === response.toString());
	// 	// 	});
	// 	// });

	// 	Tx.test(async () => {
	// 		this.sandbox.stub(Redlock.prototype, <any>'lock').resolves({});

	// 		this.sandbox.stub(Locker, 'acquireMutex').rejects();
	// 		try {
	// 			await Locker.createWriteLock(this.datasetKey);
	//
	// 		} catch (e) {
	//
	// 		}
	// 	});
	// }

	// private static testAcquireWriteLock() {

	// 	Tx.sectionInit('acquire write lock');

	// 	// unlocked dataset
	// 	Tx.test(async () => {
	// 		this.sandbox.stub(Locker, 'acquireMutex').resolves();
	// 		this.sandbox.stub(Locker, 'getLock' as any).resolves(this.writeLockValueInCache);

	// 		try {
	// 			await Locker.acquireWriteLock(this.datasetKey, 'WAxBxCx');
	// 		} catch (e) {
	// 			Tx.checkTrue(e.error.code === 423);
	// 		}
	// 	});

	// 	// unlocked dataset
	// 	Tx.test(async () => {
	// 		this.sandbox.stub(Locker, 'acquireMutex').resolves();
	// 		this.sandbox.stub(Locker, 'getLock' as any).resolves(undefined);
	// 		this.sandbox.stub(Locker, 'releaseMutex').resolves();
	// 		this.sandbox.stub(DatasetDAO, 'get').resolves([this.dataset, undefined]);
	// 		this.sandbox.stub(DatasetDAO, 'update').resolves();

	// 		const result = await Locker.acquireWriteLock(this.datasetKey, undefined);

	// 		Tx.checkTrue(result.id != null && result.cnt === 1);

	// 	});

	// 	// already locked dataset
	// 	Tx.test(async () => {
	// 		this.sandbox.stub(Locker, 'acquireMutex').resolves();
	// 		this.sandbox.stub(Locker, 'getLock' as any).resolves(this.writeLockValueInCache);
	// 		this.sandbox.stub(Locker, 'releaseMutex').resolves();

	// 		// no wid from user input
	// 		try {
	// 			await Locker.acquireWriteLock(this.datasetKey, undefined);
	// 		} catch (e) {
	// 			Tx.checkTrue(e.error.code === 423);
	// 		}

	// 	});

	// 	// already locked dataset
	// 	Tx.test(async () => {
	// 		this.sandbox.stub(Locker, 'acquireMutex').resolves();
	// 		this.sandbox.stub(Locker, 'getLock' as any).resolves(this.writeLockValueInCache);
	// 		this.sandbox.stub(Locker, 'releaseMutex').resolves();

	// 		// lock value in the cache and the user supplied wid mismatch
	// 		try {
	// 			await Locker.acquireWriteLock(this.datasetKey, undefined);
	// 		} catch (e) {
	// 			Tx.checkTrue(e.error.code === 423);
	// 		}

	// 	});

	// 	// already locked dataset
	// 	// Tx.test(async () => {
	// 	// 	this.sandbox.stub(Locker, 'acquireMutex').resolves();

	// 	// 	// lock value in the cache is a multi session read locks string
	// 	// 	this.redisClient.set(this.datasetKey, this.multiSessionReadLockValueInCache);

	// 	// 	const sessionReadLockValue: string = this.multiSessionReadLockValueInCache.substr(4).split(':')[0];
	// 	// 	const multiSessionReadLockArray: string[] = this.multiSessionReadLockValueInCache.substr(4).split(':');
	// 	// 	this.sandbox.stub(Locker, 'releaseMutex').resolves();

	// 	// 	// the wid is a session readlock value;
	// 	// 	const result = await Locker.acquireWriteLock(this.datasetKey, undefined, sessionReadLockValue);
	// 	// 	Tx.checkTrue(result.id === sessionReadLockValue && result.cnt === multiSessionReadLockArray.length);

	// 	// });

	// 	// already locked dataset
	// 	Tx.test(async () => {
	// 		this.sandbox.stub(Locker, 'acquireMutex').resolves();

	// 		// lock value in the cache is a multi session read locks string
	// 		this.redisClient.set(this.datasetKey, this.multiSessionReadLockValueInCache);

	// 		const sessionReadLockValue: string = this.multiSessionReadLockValueInCache.substr(4).split(':')[0];
	// 		this.sandbox.stub(Locker, 'releaseMutex').resolves();

	// 		// the wid value is not present in the multi session read locks string;
	// 		try {
	// 			await Locker.acquireWriteLock(this.datasetKey, undefined, 'RRandomReadLockValue');
	// 		} catch (e) {
	// 			Tx.checkTrue(e.error.code === 423);
	// 		}

	// 	});

	// }
	// private static testAcquireReadLock() {

	// 	Tx.sectionInit('acquire read lock');

	// 	// already locked with write lock
	// 	Tx.test(async () => {
	// 		this.sandbox.stub(Locker, 'acquireMutex').resolves();
	// 		this.sandbox.stub(Locker, 'releaseMutex').resolves();
	// 		this.sandbox.stub(Locker, 'getLock' as any).resolves(this.writeLockValueInCache);

	// 		try {
	// 			await Locker.acquireReadLock(this.datasetKey);
	// 		} catch (e) {
	// 			Tx.checkTrue(e.error.code === 423);
	// 		}
	// 	});

	// 	// already locked with write lock and wid mismatch
	// 	Tx.test(async () => {
	// 		this.sandbox.stub(Locker, 'acquireMutex').resolves();
	// 		this.sandbox.stub(Locker, 'releaseMutex').resolves();
	// 		this.sandbox.stub(Locker, 'getLock' as any).resolves(this.writeLockValueInCache);

	// 		const wid = this.writeLockValueInCache + '-mismatch-value';

	// 		try {
	// 			await Locker.acquireReadLock(this.datasetKey, undefined, wid);
	// 		} catch (e) {
	// 			Tx.checkTrue(e.error.code === 423);
	// 		}
	// 	});

	// 	// already locked with write lock and wid matches
	// 	Tx.test(async () => {
	// 		this.sandbox.stub(Locker, 'acquireMutex').resolves();
	// 		this.sandbox.stub(Locker, 'releaseMutex').resolves();
	// 		this.sandbox.stub(Locker, 'getLock' as any).resolves(this.writeLockValueInCache);

	// 		const wid = this.writeLockValueInCache;
	// 		const result = await Locker.acquireReadLock(this.datasetKey, undefined, wid);

	// 		Tx.checkTrue(result.id === wid && result.cnt === 1);
	// 	});

	// 	// already locked with multi session read lock
	// 	Tx.test(async () => {
	// 		this.sandbox.stub(Locker, 'acquireMutex').resolves();
	// 		this.sandbox.stub(Locker, 'releaseMutex').resolves();
	// 		this.sandbox.stub(Locker, 'getLock' as any).resolves(this.multiSessionReadLockValueInCache);

	// 		// const sessionReadLockValue: string = this.multiSessionReadLockValue.substr(4).split(':')[0];
	// 		// const multiSessionReadLockArray: string[] = this.multiSessionReadLockValue.substr(4).split(':');

	// 		const wid = 'read-lock-not-in-multi-session-readlock';
	// 		try {
	// 			const result = await Locker.acquireReadLock(this.datasetKey, undefined, wid);
	// 		} catch (e) {
	// 			Tx.checkTrue(e.error.code === 423);
	// 		}
	// 	});

	// 	// unlocked dataset with no value in cache
	// 	// Tx.test(async () => {
	// 	// 	this.sandbox.stub(Locker, 'acquireMutex').resolves();
	// 	// 	this.sandbox.stub(Locker, 'releaseMutex').resolves();
	// 	// 	this.sandbox.stub(Locker, 'getLock' as any).resolves(undefined);
	// 	// 	this.sandbox.stub(DatasetDAO, 'get').resolves([this.dataset, undefined]);

	// 	// 	const readlockID = 'RAxBxCx';
	// 	// 	this.sandbox.stub(Locker, 'generateReadLockID' as any).returns(readlockID);

	// 	// 	const result = await Locker.acquireReadLock(this.datasetKey);

	// 	// 	Tx.checkTrue(result.id === readlockID && result.cnt === 1);
	// 	// });


	// 	// // unlocked dataset with multi session read lock value in cache
	// 	// Tx.test(async () => {


	// 	// 	const readlockID = 'RAxBxCx';
	// 	// 	// const sessionReadLockValue: string = this.multiSessionReadLockValue.substr(4).split(':')[0];
	// 	// 	const multiSessionReadLockArray: string[] = this.multiSessionReadLockValueInCache.substr(4).split(':');
	// 	// 	this.sandbox.stub(Locker, 'acquireMutex').resolves();
	// 	// 	this.sandbox.stub(Locker, 'releaseMutex').resolves();
	// 	// 	this.sandbox.stub(DatasetDAO, 'get').resolves([this.dataset, undefined]);
	// 	// 	this.sandbox.stub(Locker, 'getLock' as any).resolves(multiSessionReadLockArray);
	// 	// 	this.sandbox.stub(Locker, 'generateReadLockID' as any).returns(readlockID);

	// 	// 	const result = await Locker.acquireReadLock(this.datasetKey);

	// 	// 	Tx.checkTrue(result.id === readlockID && result.cnt === 3);

	// 	// });

	// }

	// private static testUnlock() {

	// 	Tx.sectionInit('unlock');

	// 	// write lock cache value differs from the wid
	// 	Tx.test(async () => {
	// 		this.sandbox.stub(Locker, 'acquireMutex').resolves();
	// 		this.sandbox.stub(Locker, 'releaseMutex').resolves();
	// 		this.sandbox.stub(Locker, 'getLock' as any).resolves(this.writeLockValueInCache);

	// 		const wid = 'WRandomValue';
	// 		try {
	// 			await Locker.unlock(this.datasetKey, wid);
	// 		} catch (e) {
	// 			Tx.checkTrue(e.error.code === 404);
	// 		}
	// 	});

	// 	Tx.test(async () => {
	// 		this.sandbox.stub(Locker, 'acquireMutex').resolves();
	// 		this.sandbox.stub(Locker, 'releaseMutex').resolves();
	// 		this.sandbox.stub(Locker, 'getLock' as any).resolves(this.writeLockValueInCache);
	// 		this.sandbox.stub(DatasetDAO, 'get').resolves(this.dataset as any);
	// 		this.sandbox.stub(DatasetDAO, 'update').resolves();

	// 		const lockerDelStub = this.sandbox.stub(Locker, 'del');
	// 		lockerDelStub.resolves();
	// 		const wid = this.writeLockValueInCache;

	// 		const result = await Locker.unlock(this.datasetKey, wid);

	// 		Tx.checkTrue(lockerDelStub.calledWith(this.datasetKey) && result.id === null && result.cnt === 0);

	// 	});

	// 	// cache has write lock but the user does not supply wid
	// 	Tx.test(async () => {
	// 		this.sandbox.stub(Locker, 'acquireMutex').resolves();
	// 		this.sandbox.stub(Locker, 'releaseMutex').resolves();
	// 		this.sandbox.stub(Locker, 'getLock' as any).resolves(this.writeLockValueInCache);
	// 		this.sandbox.stub(DatasetDAO, 'get').resolves([this.dataset, undefined]);
	// 		this.sandbox.stub(DatasetDAO, 'update').resolves();

	// 		const lockerDelStub = this.sandbox.stub(Locker, 'del');
	// 		lockerDelStub.resolves();

	// 		const result = await Locker.unlock(this.datasetKey);

	// 		Tx.checkTrue(lockerDelStub.calledWith(this.datasetKey) && result.id === null && result.cnt === 0);

	// 	});


	// 	// cache has multi session read lock but the user does not supply wid
	// 	Tx.test(async () => {
	// 		this.sandbox.stub(Locker, 'acquireMutex').resolves();
	// 		this.sandbox.stub(Locker, 'releaseMutex').resolves();
	// 		const multiSessionReadLockArray: string[] = this.multiSessionReadLockValueInCache.substr(4).split(':');
	// 		this.sandbox.stub(Locker, 'getLock' as any).resolves(multiSessionReadLockArray);
	// 		this.sandbox.stub(DatasetDAO, 'get').resolves([this.dataset, undefined]);
	// 		this.sandbox.stub(DatasetDAO, 'update').resolves();

	// 		const lockerDelStub = this.sandbox.stub(Locker, 'del');
	// 		lockerDelStub.resolves();

	// 		const result = await Locker.unlock(this.datasetKey);

	// 		const validationResult = lockerDelStub.getCall(0).calledWith(this.datasetKey + '/' + multiSessionReadLockArray[0]) &&
	// 			lockerDelStub.getCall(1).calledWith(this.datasetKey + '/' + multiSessionReadLockArray[1]) &&
	// 			lockerDelStub.getCall(2).calledWith(this.datasetKey);

	// 		Tx.checkTrue(validationResult === true && result.id === null && result.cnt === 0);

	// 	});


	// 	// cache has multi session read lock and the user supplies a wid
	// 	// which is in the cache's multi session read lock value
	// 	Tx.test(async () => {
	// 		this.sandbox.stub(Locker, 'acquireMutex').resolves();
	// 		this.sandbox.stub(Locker, 'releaseMutex').resolves();
	// 		const multiSessionReadLockArray: string[] = this.multiSessionReadLockValueInCache.substr(4).split(':');
	// 		this.sandbox.stub(Locker, 'getLock' as any).resolves(multiSessionReadLockArray);
	// 		this.sandbox.stub(DatasetDAO, 'get').resolves([this.dataset, undefined]);
	// 		this.sandbox.stub(DatasetDAO, 'update').resolves();

	// 		const lockerDelStub = this.sandbox.stub(Locker, 'del');
	// 		lockerDelStub.resolves();

	// 		const wid = multiSessionReadLockArray[0];

	// 		const setLockStub = this.sandbox.stub(Locker, 'setLock' as any);
	// 		setLockStub.resolves();

	// 		this.sandbox.stub(Locker, 'getTTL' as any).resolves(3600);


	// 		const result = await Locker.unlock(this.datasetKey, wid);

	// 		// during unlock, wid should be removed from the multi session read lock array
	// 		// and the new array value must be reset in cache
	// 		multiSessionReadLockArray.shift();
	// 		const validationResult = setLockStub.calledWith(this.datasetKey, multiSessionReadLockArray, 3600)
	// 			&& lockerDelStub.calledWith(this.datasetKey + '/' + wid);

	// 		Tx.checkTrue(validationResult === true && result.id === multiSessionReadLockArray[0] && result.cnt === 1);

	// 	});

	// 	// cache has multi session read lock and the user supplies a wid
	// 	// which is not in the cache's multi session read lock value
	// 	Tx.test(async () => {
	// 		this.sandbox.stub(Locker, 'acquireMutex').resolves();
	// 		this.sandbox.stub(Locker, 'releaseMutex').resolves();
	// 		const multiSessionReadLockArray: string[] = this.multiSessionReadLockValueInCache.substr(4).split(':');
	// 		this.sandbox.stub(Locker, 'getLock' as any).resolves(multiSessionReadLockArray);
	// 		this.sandbox.stub(DatasetDAO, 'get').resolves([this.dataset, undefined]);
	// 		this.sandbox.stub(DatasetDAO, 'update').resolves();

	// 		const lockerDelStub = this.sandbox.stub(Locker, 'del');
	// 		lockerDelStub.resolves();

	// 		const wid = 'WSomeRandom';

	// 		try {
	// 			await Locker.unlock(this.datasetKey, wid);
	// 		} catch (e) {
	// 			Tx.checkTrue(e.error.code === 404);
	// 		}

	// 	});

	// 	// cache was no lock value for the dataset but the user supplies wid
	// 	Tx.test(async () => {

	// 		const wid = 'WSomeRandom';
	// 		this.dataset.sbit = 'WSomeRandom';

	// 		this.sandbox.stub(Locker, 'acquireMutex').resolves();
	// 		this.sandbox.stub(Locker, 'releaseMutex').resolves();
	// 		this.sandbox.stub(Locker, 'getLock' as any).resolves(undefined);
	// 		this.sandbox.stub(DatasetDAO, 'get').resolves([this.dataset, undefined]);
	// 		this.sandbox.stub(DatasetDAO, 'update').resolves();

	// 		const result = await Locker.unlock(this.datasetKey, wid);

	// 		Tx.checkTrue(result.id === null && result.cnt === 0);

	// 	});

	// }

	// private static testUnlockReadLockSession() {
	// 	Tx.sectionInit('unlock readlock session');

	// 	// cache contains a multi session read lock value and the
	// 	// user supplies a wid present in the multi session read lock value
	// 	Tx.test(async () => {
	// 		const multiSessionReadLockArray: string[] = this.multiSessionReadLockValueInCache.substr(4).split(':');
	// 		const wid = multiSessionReadLockArray[0];

	// 		this.sandbox.stub(Locker, 'acquireMutex').resolves();
	// 		this.sandbox.stub(Locker, 'releaseMutex').resolves();
	// 		this.sandbox.stub(Locker, 'getLock' as any).resolves(multiSessionReadLockArray);
	// 		this.sandbox.stub(Locker, 'getTTL' as any).resolves(3600);

	// 		const lockerDelStub = this.sandbox.stub(Locker, 'del');
	// 		lockerDelStub.resolves();

	// 		const setLockStub = this.sandbox.stub(Locker, 'setLock' as any);
	// 		setLockStub.resolves();

	// 		await Locker.unlockReadLockSession(this.datasetKey, wid);

	// 		multiSessionReadLockArray.shift();
	// 		const validationResult = setLockStub.calledWith(this.datasetKey, multiSessionReadLockArray, 3600);
	// 		Tx.checkTrue(validationResult === true);

	// 	});



	// 	// cache contains a multi session read lock value and the
	// 	// user supplies a wid present in the multi session read lock value
	// 	Tx.test(async () => {
	// 		const multiSessionReadLockArray: string[] = ['RAxBxCx'];
	// 		const wid = multiSessionReadLockArray[0];

	// 		this.sandbox.stub(Locker, 'acquireMutex').resolves();
	// 		this.sandbox.stub(Locker, 'releaseMutex').resolves();
	// 		this.sandbox.stub(Locker, 'getLock' as any).resolves(multiSessionReadLockArray);
	// 		this.sandbox.stub(Locker, 'getTTL' as any).resolves(3600);

	// 		const lockerDelStub = this.sandbox.stub(Locker, 'del');
	// 		lockerDelStub.resolves();

	// 		await Locker.unlockReadLockSession(this.datasetKey, wid);

	// 		const validationResult = lockerDelStub.calledWith(this.datasetKey);
	// 		Tx.checkTrue(validationResult === true);

	// 	});
	// }

	// private static acquireMutex() {

	// 	Tx.sectionInit('acquire mutex');

	// 	Tx.test(async () => {
	// 		const cacheLock = {};
	// 		this.sandbox.stub(Redlock.prototype, <any>'lock').resolves(cacheLock);
	// 		const result = await Locker.acquireMutex(this.datasetKey);
	// 		Tx.checkTrue(result === cacheLock);

	// 	});

	// 	Tx.test(async () => {
	// 		const cacheLock = { lock: 'cache_lock' };
	// 		this.sandbox.stub(Redlock.prototype, <any>'lock').rejects();
	// 		try {
	// 			await Locker.acquireMutex(this.datasetKey);
	//
	// 		} catch (e) {
	// 			Tx.checkTrue(e.error.code === 423);
	// 		}
	// 	});
	// }

	// private static releaseMutex() {

	// 	Tx.sectionInit('release mutex');

	// 	// Tx.test(async () => {
	// 	// 	const cacheLock = { lock: 'cache_lock' };
	// 	// 	this.sandbox.stub(Redlock.prototype, <any>'unlock').resolves();
	// 	// 	await Locker.releaseMutex(cacheLock,);
	// 	//
	// 	// });

	// 	Tx.test(async () => {
	// 		const cacheLock = { lock: 'cache_lock' };
	// 		this.sandbox.stub(Redlock.prototype, <any>'unlock').rejects();
	// 		try {
	// 			await Locker.releaseMutex(cacheLock);
	//
	// 		} catch (e) {
	// 			Tx.checkTrue(e.error.code === 423);
	// 		}

	// 	});
	// }


}
