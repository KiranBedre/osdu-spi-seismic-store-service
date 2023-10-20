// ============================================================================
// Copyright 2017-2021, Schlumberger
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

import Redis from 'ioredis';
import Redlock from 'redlock';
import { Config, LoggerFactory } from '../../cloud';
import { Error, Utils } from '../../shared';

// lock interface (this is the cache entry)
interface ILock { id: string; cnt: number; }

// Write Lock interface
export interface IWriteLockSession { idempotent: boolean, wid: string, mutex: any, key: string; };

export class Locker {

    private static TTL = 6000; // max lock time in ms
    private static EXP_WRITE_LOCK = 86400; // after 24h the write lock entry will be removed
    private static EXP_READ_LOCK = 3600; // after 1h  the read lock entry will be removed
    private static TIME_5MIN = 300; // exp time margin to use in the main read locks

    private static redisClient: Redis;
    private static redisSubscriptionClient: Redis;
    private static redlock: Redlock;

    public static getWriteLockTTL(): number { return this.EXP_WRITE_LOCK; };
    public static getReadLockTTL(): number { return this.EXP_READ_LOCK; };
    public static getMutexTTL(): number { return this.TTL; };

    // Exponential Retry strategy in event of an error
    private static retryStrategy = (times: number) => {
        return Math.pow(2, times) + Math.random() * 100;
    };

    public static async init() {

        if (Config.UTEST) {
            const redis = require('ioredis-mock');
            this.redisClient = new redis();
            this.redisSubscriptionClient = new redis();
        } else {

            if (Config.LOCKSMAP_REDIS_INSTANCE_KEY) {
                if (Config.LOCKSMAP_REDIS_INSTANCE_TLS_DISABLE) {
                    this.redisClient = new Redis({
                        host: Config.LOCKSMAP_REDIS_INSTANCE_ADDRESS,
                        port: Config.LOCKSMAP_REDIS_INSTANCE_PORT,
                        password: Config.LOCKSMAP_REDIS_INSTANCE_KEY,
                        maxRetriesPerRequest: 10,
                        retryStrategy: this.retryStrategy,
                        commandTimeout: 60000,
                        connectionName: 'sdms-locker'
                    });
                    this.redisSubscriptionClient = new Redis({
                        host: Config.LOCKSMAP_REDIS_INSTANCE_ADDRESS,
                        port: Config.LOCKSMAP_REDIS_INSTANCE_PORT,
                        password: Config.LOCKSMAP_REDIS_INSTANCE_KEY,
                        maxRetriesPerRequest: 10,
                        retryStrategy: this.retryStrategy,
                        commandTimeout: 60000,
                        connectionName: 'sdms-locker-subscription'
                    });
                } else {
                    this.redisClient = new Redis({
                        host: Config.LOCKSMAP_REDIS_INSTANCE_ADDRESS,
                        port: Config.LOCKSMAP_REDIS_INSTANCE_PORT,
                        password: Config.LOCKSMAP_REDIS_INSTANCE_KEY,
                        tls: { servername: Config.LOCKSMAP_REDIS_INSTANCE_ADDRESS },
                        maxRetriesPerRequest: 10,
                        retryStrategy: this.retryStrategy,
                        commandTimeout: 60000,
                        connectionName: 'sdms-locker'
                    });
                    this.redisSubscriptionClient = new Redis({
                        host: Config.LOCKSMAP_REDIS_INSTANCE_ADDRESS,
                        port: Config.LOCKSMAP_REDIS_INSTANCE_PORT,
                        password: Config.LOCKSMAP_REDIS_INSTANCE_KEY,
                        tls: { servername: Config.LOCKSMAP_REDIS_INSTANCE_ADDRESS },
                        maxRetriesPerRequest: 10,
                        retryStrategy: this.retryStrategy,
                        commandTimeout: 60000,
                        connectionName: 'sdms-locker-subscription'
                    });
                }

            }
            else {

                this.redisClient = new Redis({
                    host: Config.LOCKSMAP_REDIS_INSTANCE_ADDRESS,
                    port: Config.LOCKSMAP_REDIS_INSTANCE_PORT,
                    maxRetriesPerRequest: 10,
                    retryStrategy: this.retryStrategy,
                    commandTimeout: 60000,
                    connectionName: 'sdms-locker'
                });
                this.redisSubscriptionClient = new Redis({
                    host: Config.LOCKSMAP_REDIS_INSTANCE_ADDRESS,
                    port: Config.LOCKSMAP_REDIS_INSTANCE_PORT,
                    maxRetriesPerRequest: 10,
                    retryStrategy: this.retryStrategy,
                    commandTimeout: 60000,
                    connectionName: 'sdms-locker-subscription'
                });
            }

            // tslint:disable-next-line:no-floating-promises
            this.redisClient.config('SET', 'notify-keyspace-events', 'Ex');

            // This will automatically remove the wid entries from the main read lock
            this.redisSubscriptionClient.on('message', async (channel, key) => {
                if (channel === '__keyevent@0__:expired') {
                    await Locker.unlockReadLockSession(
                        key.substring(0, key.lastIndexOf('/')),
                        key.substring(key.lastIndexOf('/') + 1)
                    );
                }
            });

            this.redisClient.on('error', (error) => {
                LoggerFactory.build(Config.CLOUDPROVIDER).error(error);
            });


        }

        // initialize the locker
        this.redlock = new Redlock([this.redisClient], {
            // the expected clock drift
            driftFactor: 0.01, // time in ms
            // the max number of times Redlock will attempt
            // to lock a resource before erroring
            retryCount: 10,
            // the time in ms between attempts
            retryDelay: 200, // time in ms
            // the max time in ms randomly added to retries
            // to improve performance under high contention
            retryJitter: 200, // time in ms
        });
    }

    private static generateReadLockID(): string {
        return 'R' + Utils.makeID(15);
    }

    private static generateWriteLockID(): string {
        return 'W' + Utils.makeID(15);
    }

    public static isWriteLock(lock: string[] | string): boolean {
        return typeof (lock) === 'string';
    }

    private static getLockMessage(lockKey: string, lockValue: string[] | string): string {
        if (this.isWriteLock(lockValue)) {
            const operationType = typeof (lockValue) === 'string' && lockValue.startsWith('WDELETE') ? 'deletion' : 'write';
            return lockKey + ' is locked for ' + operationType + ' with different id ' + Error.get423WriteLockReason();
        } else {
            return lockKey + ' is locked for read with different id ' + Error.get423ReadLockReason();
        }
    };

    public static async getLock(key: string): Promise<string[] | string> {
        const entity = await this.get(key);
        return entity ? entity.startsWith('rms') ? entity.substr(4).split(':') : entity : undefined;
    }

    private static async setLock(key: string, value: string[] | string, expireTime: number): Promise<string> {
        return value ? typeof (value) === 'string' ?
            await this.set(key, value as string, expireTime) :
            await this.set(key, 'rms:' + (value as string[]).join(':'), expireTime) : undefined;
    }

    private static async get(key: string): Promise<string> {
        return await this.redisClient.get(key);
    }

    private static async set(key: string, value: string, expireTime: number): Promise<string> {
        return await this.redisClient.setex(key, expireTime, value);
    }

    public static async del(key: string): Promise<number> {
        return await this.redisClient.del(key);
    }

    private static async getTTL(key: string): Promise<number> {
        return await this.redisClient.ttl(key);
    }

    // create a write lock for new resources. This is a locking operation!
    // it place the mutex on the required resource!!! (the caller should remove the mutex)
    public static async createWriteLock(lockKey: string, idempotentWriteLock?: string): Promise<IWriteLockSession> {

        // const datasetPath = dataset.tenant + '/' + dataset.subproject + dataset.path + dataset.name;
        const cacheLock = await this.acquireMutex(lockKey);
        const lockValue = (await Locker.getLock(lockKey));

        // idempotency requirement
        if (idempotentWriteLock && !idempotentWriteLock.startsWith('W')) {
            throw (Error.make(Error.Status.BAD_REQUEST,
                'The provided idempotency key, for a write-lock operation, must start with the \'W\' letter'));
        }

        // if the lockValue is not present in the redis cache,
        // create the [KEY,VALUE] = [datasetPath, wid(sbit)] pair in the redis cache
        if (!lockValue) {
            const lockValueNew = idempotentWriteLock || this.generateWriteLockID();
            await this.set(lockKey, lockValueNew, this.EXP_WRITE_LOCK);
            return { idempotent: false, wid: lockValueNew, mutex: cacheLock, key: lockKey };
        }

        // check if the write lock already exist and match the input one (idempotent call)
        if (idempotentWriteLock && lockValue === idempotentWriteLock) {
            return { idempotent: true, wid: idempotentWriteLock, mutex: cacheLock, key: lockKey };
        }

        let mex: string;
        if(this.isWriteLock(lockValue)) {
            mex = lockKey + ' is write locked ' + Error.get423WriteLockReason();
        } else {
            mex = lockKey + ' is read locked ' + Error.get423ReadLockReason();
        }
        throw (Error.make(Error.Status.LOCKED, mex));
    }

    // remove both lock and mutex
    public static async removeWriteLock(writeLockSession: IWriteLockSession, keepTheLock = false): Promise<void> {
        if (writeLockSession && writeLockSession.mutex) {
            await Locker.releaseMutex(writeLockSession.mutex);
        }
        if (!keepTheLock) {
            if (writeLockSession && writeLockSession.wid) {
                await Locker.del(writeLockSession.key);
            }
        }
    }

    // acquire write lock on the resource and update the status on the metadata
    public static async acquireWriteLock(lockKey: string, idempotentWriteLock: string, wid?: string): Promise<ILock> {

        // idempotency requirement
        if (idempotentWriteLock && !idempotentWriteLock.startsWith('W')) {
            throw (Error.make(Error.Status.BAD_REQUEST,
                'The provided idempotency key, for a write-lock operation, must start with the \'W\' letter'));
        }

        const cacheLock = await this.acquireMutex(lockKey);
        const lockValue = (await Locker.getLock(lockKey));

        // Already write locked but the idempotentWriteLock match the once in cache (idempotent call)
        if (lockValue && idempotentWriteLock && lockValue === idempotentWriteLock) {
            await this.releaseMutex(cacheLock);
            return { id: idempotentWriteLock, cnt: 0 };
        }

        if (lockValue && wid && wid !== lockValue && this.isWriteLock(lockValue)) {
            await this.releaseMutex(cacheLock);
            throw (Error.make(Error.Status.LOCKED, this.getLockMessage(lockKey, lockValue)));
        }

        // ------------------------------------------------
        // [01] - unlocked dataset (no lock values)
        // ------------------------------------------------

        if (!lockValue) {

            // create a new write lock and save in cache
            const lockID = idempotentWriteLock || this.generateWriteLockID();
            await Locker.set(lockKey, lockID, this.EXP_WRITE_LOCK);
            await this.releaseMutex(cacheLock);
            return { id: lockID, cnt: 1 };
        }

        // ------------------------------------------------
        // [02] - locked dataset
        // ------------------------------------------------

        // wid not specified - impossible lock
        if (!wid) {
            await this.releaseMutex(cacheLock);
            throw (Error.make(Error.Status.LOCKED, this.getLockMessage(lockKey, lockValue)));
        }

        // write locked and different wid
        if (this.isWriteLock(lockValue) && wid !== lockValue) {
            await this.releaseMutex(cacheLock);
            throw (Error.make(Error.Status.LOCKED, this.getLockMessage(lockKey, lockValue)));
        }

        if (!this.isWriteLock(lockValue) && lockValue.indexOf(wid) === -1) {
            await this.releaseMutex(cacheLock);
            throw (Error.make(Error.Status.LOCKED, this.getLockMessage(lockKey, lockValue)));
        }

        // Trusted Open
        await this.releaseMutex(cacheLock);
        return { id: wid, cnt: this.isWriteLock(lockValue) ? 1 : (lockValue as string[]).length };

    }

    // create lock existing resource
    public static async acquireReadLock(lockKey: string, idempotentReadLock?: string, wid?: string): Promise<ILock> {

        // idempotency requirement
        if (idempotentReadLock && !idempotentReadLock.startsWith('R')) {
            throw (Error.make(Error.Status.BAD_REQUEST,
                'The provided idempotency key, for a read-lock operation, must start with the \'R\' letter'));
        }

        // const datasetPath = dataset.tenant + '/' + dataset.subproject + dataset.path + dataset.name;
        const cacheLock = await this.acquireMutex(lockKey);
        const lockValue = (await Locker.getLock(lockKey));

        if (lockValue && idempotentReadLock && !this.isWriteLock(lockValue) &&
            (lockValue as string[]).indexOf(idempotentReadLock) > -1) {
            await this.releaseMutex(cacheLock);
            return { id: idempotentReadLock, cnt: (lockValue as string[]).length };
        }

        if (this.isWriteLock(lockValue)) {

            // wid not specified -> error locked for write
            if (!wid) {
                await this.releaseMutex(cacheLock);
                throw (Error.make(Error.Status.LOCKED, this.getLockMessage(lockKey, lockValue)));
            }

            // wid different -> error different wid
            if (wid !== lockValue) {
                await this.releaseMutex(cacheLock);
                throw (Error.make(Error.Status.LOCKED, this.getLockMessage(lockKey, lockValue)));
            }

            // wid match -> TRUSTED OPEN
            await this.releaseMutex(cacheLock);
            return { id: lockValue, cnt: 1 };
        }

        if (lockValue && wid && lockValue.indexOf(wid) === -1) {
            await this.releaseMutex(cacheLock);
            throw (Error.make(Error.Status.LOCKED,
                lockKey + ' is locked for read with different ids ' + Error.get423ReadLockReason()));
        }

        // ------------------------------------------------
        // [01] - unlocked dataset (no lock values)
        // ------------------------------------------------

        if (!lockValue) {

            // create a new read lock session and a new main read lock
            const lockID = idempotentReadLock || this.generateReadLockID();
            await Locker.setLock(lockKey + '/' + lockID, lockID, this.EXP_READ_LOCK);
            await Locker.setLock(lockKey, [lockID], this.EXP_READ_LOCK + this.TIME_5MIN);
            // when the session key expired i have to remove the wid/lockid from the main read lock
            this.redisSubscriptionClient.subscribe('__keyevent@0__:expired', lockKey + '/' + lockID)
                .catch((error) => LoggerFactory.build(Config.CLOUDPROVIDER).error(JSON.stringify(error)));

            await this.releaseMutex(cacheLock);
            return { id: lockID, cnt: 1 };
        }

        // ------------------------------------------------
        // [03] - read locked (array of session id)
        // ------------------------------------------------

        // wid not present -> create a new read session and update the main read lock
        if (!wid) {
            const lockID = idempotentReadLock || this.generateReadLockID();
            (lockValue as string[]).push(lockID);
            await Locker.setLock(lockKey + '/' + lockID, lockID, this.EXP_READ_LOCK);
            await Locker.setLock(lockKey, lockValue, this.EXP_READ_LOCK + this.TIME_5MIN);
            await this.releaseMutex(cacheLock);
            // when the session key expired i have to remove the wid/lockid from the main read lock
            this.redisSubscriptionClient.subscribe('__keyevent@0__:expired', lockKey + '/' + lockID)
                .catch((error) => LoggerFactory.build(Config.CLOUDPROVIDER).error(JSON.stringify(error)));
            return { id: lockID, cnt: (lockValue as string[]).length };
        }

        // wid present and found in read lock ids -> TRUSTED OPEN
        await this.releaseMutex(cacheLock);
        return { id: wid, cnt: (lockValue as string[]).length };

    }

    public static async unlock(lockKey: string, wid?: string): Promise<ILock> {

        const cacheLock = await this.acquireMutex(lockKey);

        const lockValue = (await Locker.getLock(lockKey));

        if (wid && lockValue) {

            if (this.isWriteLock(lockValue)) {
                // wrong close id
                if (lockValue !== wid) {
                    await this.releaseMutex(cacheLock);
                    throw (Error.make(Error.Status.NOT_FOUND,
                        lockKey + ' has been locked with different ID'));
                }

                // unlock in cache
                await Locker.del(lockKey);
                await this.releaseMutex(cacheLock);
                return { id: null, cnt: 0 };
            }
        }

        // ------------------------------------------------
        // [01] - global unlock
        // ------------------------------------------------

        if (!wid) {

            // if dataset is locked
            if (lockValue) {

                // if read locked remove all session read locks
                if (!this.isWriteLock(lockValue)) {
                    for (const item of lockValue) {
                        await Locker.del(lockKey + '/' + item);
                    }
                }

                // remove main lock from cache
                await Locker.del(lockKey);
                await this.releaseMutex(cacheLock);
                return { id: null, cnt: 0 };

            }

            // dataset already unlocked
            await this.releaseMutex(cacheLock);
            return { id: null, cnt: 0 };
        }

        // ------------------------------------------------
        // [02] - session unlock
        // ------------------------------------------------

        if (lockValue) {

            // read locked
            const lockIndex = lockValue.indexOf(wid);

            // wrong close id
            if (lockIndex === -1) {
                await this.releaseMutex(cacheLock);
                throw (Error.make(Error.Status.NOT_FOUND,
                    lockKey + ' has been locked with different IDs'));
            }

            // remove the session read lock and update the main read lock
            await Locker.del(lockKey + '/' + wid);
            const lockValueNew = (lockValue as string[]).filter((el) => el !== wid);
            if (lockValueNew.length > 0) {
                const ttl = await Locker.getTTL(lockKey);
                await Locker.setLock(lockKey, lockValueNew, ttl);
            } else {
                await Locker.del(lockKey);
            }
            await this.releaseMutex(cacheLock);
            return {
                cnt: lockValueNew.length > 0 ? lockValueNew.length : 0,
                id: lockValueNew.length > 0 ? lockValueNew.join(',') : null,
            };
        }

        // ------------------------------------------------
        // [03] - unlocked
        // ------------------------------------------------

        // case 2: dataset already unlocked
        await this.releaseMutex(cacheLock);
        return { id: null, cnt: 0 };
    }

    public static async unlockReadLockSession(key: string, wid: string) {

        const cacheLock = await this.acquireMutex(key);
        const lockValue = (await Locker.getLock(key));

        if (lockValue && !this.isWriteLock(lockValue)) {
            if (lockValue.indexOf(wid) > -1) {
                const lockValueNew = (lockValue as string[]).filter((el) => el !== wid);
                if (lockValueNew.length > 0) {
                    const ttl = await Locker.getTTL(key);
                    await Locker.setLock(key, lockValueNew, ttl);
                } else {
                    await Locker.del(key);
                }
            }
        }

        await this.releaseMutex(cacheLock);

    }

    // We are acquiring a shared mutex on redis using redlock
    public static async acquireMutex(key: string): Promise<any> {

        try {
            const cacheLock = await this.redlock.acquire(['locks:' + key], this.TTL);
            return cacheLock;
        } catch (error) {
            throw Error.make(Error.Status.LOCKED, key +
                ' cannot be locked at the moment. Please try again shortly. ' +
                Error.get423CannotLockReason());
        }

    }

    public static async releaseMutex(cacheLock: any): Promise<void> {

        // attempt to unlock the resource, retry in case of error or let the redlock release it
        let retry = 4;
        do {
            try {
                await this.redlock.release(cacheLock);
                return;
            } catch (error) {
                await new Promise((resolve) => { setTimeout(resolve, 200); });
            }
        } while (retry--)
    }

}
