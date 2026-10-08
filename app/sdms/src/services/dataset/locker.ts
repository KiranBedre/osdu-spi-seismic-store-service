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

import Redis, { Cluster, RedisOptions } from 'ioredis';
import Redlock from 'redlock';
import { Config, LoggerFactory } from '../../cloud';
import { Error, Utils } from '../../shared';

// lock interface (this is the cache entry)
interface ILock { id: string; cnt: number; }

// Write Lock interface
export interface IWriteLockSession { idempotent: boolean, wid: string, mutex: any, key: string; };

export class Locker {

    private readonly TTL = 6000; // max lock time in ms
    private readonly EXP_WRITE_LOCK = 86400; // after 24h the write lock entry will be removed
    private readonly EXP_READ_LOCK = 3600; // after 1h  the read lock entry will be removed
    private readonly TIME_5MIN = 300; // exp time margin to use in the main read locks

    private static readonly REDIS_MAX_RETRIES_PER_REQUEST = 10;
    private static readonly REDIS_COMMAND_TIMEOUT_MS = 60000; // 60 seconds

    protected redisClient: Redis | Cluster;
    protected redisSubscriptionClient: Redis | Cluster;
    private redlock: Redlock;

    public getWriteLockTTL(): number { return this.EXP_WRITE_LOCK; }
    public getReadLockTTL(): number { return this.EXP_READ_LOCK; }
    public getMutexTTL(): number { return this.TTL; }

    /**
     * Creates base Redis options with standard retry and timeout configuration
     */
    protected createBaseRedisOptions(): RedisOptions {
        return {
            maxRetriesPerRequest: Locker.REDIS_MAX_RETRIES_PER_REQUEST,
            retryStrategy: (times: number) => {
                return Math.pow(2, times) + Math.random() * 100;
            },
            commandTimeout: Locker.REDIS_COMMAND_TIMEOUT_MS
        } as RedisOptions;
    }

    public async init() {

        if (Config.UTEST) {
            const redis = require('ioredis-mock');
            this.redisClient = new redis();
            this.redisSubscriptionClient = new redis();
        } else {
            // Build Redis options incrementally
            const redisBaseOptions: RedisOptions = {
                host: Config.LOCKSMAP_REDIS_INSTANCE_ADDRESS,
                port: Config.LOCKSMAP_REDIS_INSTANCE_PORT,
                ...this.createBaseRedisOptions()
            };

            if (Config.LOCKSMAP_REDIS_INSTANCE_KEY) {
                redisBaseOptions.password = Config.LOCKSMAP_REDIS_INSTANCE_KEY;
            }

            // Apply TLS configuration
            if (!Config.LOCKSMAP_REDIS_INSTANCE_TLS_DISABLE) {
                redisBaseOptions.tls = { servername: Config.LOCKSMAP_REDIS_INSTANCE_ADDRESS };
            }

            // Create primary client
            this.redisClient = new Redis({
                ...redisBaseOptions,
                connectionName: 'sdms-locker'
            });

            // Create subscription client
            this.redisSubscriptionClient = new Redis({
                ...redisBaseOptions,
                connectionName: 'sdms-locker-subscription'
            });
        }

        // Setup event handlers
        this.setupEventHandlers();

        // Initialize Redlock
        this.initializeRedlock();
    }

    /**
     * Setup Redis event handlers for message subscriptions and errors
     */
    protected setupEventHandlers() {
        // This will automatically remove the wid entries from the main read lock
        this.redisSubscriptionClient.on('message', async (channel, key) => {
            if (channel === '__keyevent@0__:expired') {
                await this.unlockReadLockSession(
                    key.substring(0, key.lastIndexOf('/')),
                    key.substring(key.lastIndexOf('/') + 1)
                );
            }
        });

        this.redisClient.on('error', (error) => {
            LoggerFactory.build(Config.CLOUDPROVIDER).error(error);
        });

        this.redisSubscriptionClient.on('error', (error) => {
            LoggerFactory.build(Config.CLOUDPROVIDER).error(error);
        });
    }

    /**
     * Initialize the Redlock distributed lock manager
     */
    protected initializeRedlock() {
        // Note: Even with built-in ioredis v5.x types, there's still a type mismatch
        // with Redlock v5's eval method signature
        this.redlock = new Redlock([this.redisClient as any], {
            // the expected clock drift
            driftFactor: 0.01, // time in ms
            // the max number of times Redlock will attempt
            // to lock a resource before erroring
            retryCount: 10,
            // the time in ms between attempts
            retryDelay: 200, // time in ms
            // the max time in ms randomly added to retries
            // to improve performance under high contention
            retryJitter: 200 // time in ms
        });
    }

    private generateReadLockID(): string {
        return 'R' + Utils.makeID(15);
    }

    private generateWriteLockID(): string {
        return 'W' + Utils.makeID(15);
    }

    public isWriteLock(lock: string[] | string): boolean {
        return typeof (lock) === 'string';
    }

    private getLockMessage(lockKey: string, lockValue: string[] | string): string {
        if (this.isWriteLock(lockValue)) {
            const operationType =
                typeof (lockValue) === 'string' && lockValue.startsWith('WDELETE') ? 'deletion' : 'write';
            return lockKey + ' is locked for ' + operationType + ' with different id ' + Error.get423WriteLockReason();
        } else {
            return lockKey + ' is locked for read with different id ' + Error.get423ReadLockReason();
        }
    }

    public async getLock(key: string): Promise<string[] | string> {
        const entity = await this.get(key);
        return entity ? entity.startsWith('rms') ? entity.substr(4).split(':') : entity : undefined;
    }

    private async setLock(key: string, value: string[] | string, expireTime: number): Promise<string> {
        return value ? typeof (value) === 'string' ?
            await this.set(key, value as string, expireTime) :
            await this.set(key, 'rms:' + (value as string[]).join(':'), expireTime) : undefined;
    }

    private async get(key: string): Promise<string> {
        return await this.redisClient.get(key);
    }

    private async set(key: string, value: string, expireTime: number): Promise<string> {
        return await this.redisClient.setex(key, expireTime, value);
    }

    public async del(key: string): Promise<number> {
        return await this.redisClient.del(key);
    }

    /**
     * Atomic SET NX with TTL — sets key only if it does not exist.
     * @returns 'OK' if the lock was acquired, null if the key already exists.
     */
    public async setNX(key: string, value: string, ttlSeconds: number): Promise<string | null> {
        return await this.redisClient.set(key, value, 'EX', ttlSeconds, 'NX');
    }

    /**
     * Conditional delete — deletes key only if its value matches.
     * Uses a Lua script for atomicity.
     * @returns true if the key was deleted, false if value didn't match or key doesn't exist.
     */
    public async delIfMatch(key: string, expectedValue: string): Promise<boolean> {
        const script = `
            if redis.call("get", KEYS[1]) == ARGV[1] then
                return redis.call("del", KEYS[1])
            else
                return 0
            end
        `;
        const result = await this.redisClient.eval(script, 1, key, expectedValue);
        return result === 1;
    }

    private async getTTL(key: string): Promise<number> {
        return await this.redisClient.ttl(key);
    }

    // create a write lock for new resources. This is a locking operation!
    // it place the mutex on the required resource!!! (the caller should remove the mutex)
    public async createWriteLock(lockKey: string, idempotentWriteLock?: string): Promise<IWriteLockSession> {

        // const datasetPath = dataset.tenant + '/' + dataset.subproject + dataset.path + dataset.name;
        const cacheLock = await this.acquireMutex(lockKey);
        const lockValue = (await this.getLock(lockKey));

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
    public async removeWriteLock(writeLockSession: IWriteLockSession, keepTheLock = false): Promise<void> {
        if (writeLockSession && writeLockSession.mutex) {
            await this.releaseMutex(writeLockSession.mutex);
        }
        if (!keepTheLock) {
            if (writeLockSession && writeLockSession.wid) {
                await this.del(writeLockSession.key);
            }
        }
    }

    // acquire write lock on the resource and update the status on the metadata
    public async acquireWriteLock(lockKey: string, idempotentWriteLock: string, wid?: string): Promise<ILock> {

        // idempotency requirement
        if (idempotentWriteLock && !idempotentWriteLock.startsWith('W')) {
            throw (Error.make(Error.Status.BAD_REQUEST,
                'The provided idempotency key, for a write-lock operation, must start with the \'W\' letter'));
        }

        const cacheLock = await this.acquireMutex(lockKey);
        const lockValue = (await this.getLock(lockKey));

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
            await this.set(lockKey, lockID, this.EXP_WRITE_LOCK);
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
    public async acquireReadLock(lockKey: string, idempotentReadLock?: string, wid?: string): Promise<ILock> {

        // idempotency requirement
        if (idempotentReadLock && !idempotentReadLock.startsWith('R')) {
            throw (Error.make(Error.Status.BAD_REQUEST,
                'The provided idempotency key, for a read-lock operation, must start with the \'R\' letter'));
        }

        // const datasetPath = dataset.tenant + '/' + dataset.subproject + dataset.path + dataset.name;
        const cacheLock = await this.acquireMutex(lockKey);
        const lockValue = (await this.getLock(lockKey));

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
            await this.setLock(lockKey + '/' + lockID, lockID, this.EXP_READ_LOCK);
            await this.setLock(lockKey, [lockID], this.EXP_READ_LOCK + this.TIME_5MIN);
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
            await this.setLock(lockKey + '/' + lockID, lockID, this.EXP_READ_LOCK);
            await this.setLock(lockKey, lockValue, this.EXP_READ_LOCK + this.TIME_5MIN);
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

    public async unlock(lockKey: string, wid?: string): Promise<ILock> {

        const cacheLock = await this.acquireMutex(lockKey);

        const lockValue = (await this.getLock(lockKey));

        if (wid && lockValue) {

            if (this.isWriteLock(lockValue)) {
                // wrong close id
                if (lockValue !== wid) {
                    await this.releaseMutex(cacheLock);
                    throw (Error.make(Error.Status.NOT_FOUND,
                        lockKey + ' has been locked with different ID'));
                }

                // unlock in cache
                await this.del(lockKey);
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
                        await this.del(lockKey + '/' + item);
                    }
                }

                // remove main lock from cache
                await this.del(lockKey);
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
            await this.del(lockKey + '/' + wid);
            const lockValueNew = (lockValue as string[]).filter((el) => el !== wid);
            if (lockValueNew.length > 0) {
                const ttl = await this.getTTL(lockKey);
                await this.setLock(lockKey, lockValueNew, ttl);
            } else {
                await this.del(lockKey);
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

    public async unlockReadLockSession(key: string, wid: string) {

        const cacheLock = await this.acquireMutex(key);
        const lockValue = (await this.getLock(key));

        if (lockValue && !this.isWriteLock(lockValue)) {
            if (lockValue.indexOf(wid) > -1) {
                const lockValueNew = (lockValue as string[]).filter((el) => el !== wid);
                if (lockValueNew.length > 0) {
                    const ttl = await this.getTTL(key);
                    await this.setLock(key, lockValueNew, ttl);
                } else {
                    await this.del(key);
                }
            }
        }

        await this.releaseMutex(cacheLock);
    }

    // We are acquiring a shared mutex on redis using redlock
    public async acquireMutex(key: string): Promise<any> {

        try {
            const cacheLock = await this.redlock.acquire(['locks:' + key], this.TTL);
            return cacheLock;
        } catch (error) {
            throw Error.make(Error.Status.LOCKED, key +
                ' cannot be locked at the moment. Please try again shortly. ' +
                Error.get423CannotLockReason());
        }
    }

    public async releaseMutex(cacheLock: any): Promise<void> {

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

    /**
     * Cleanup method for graceful shutdown.
     * Override in derived classes for provider-specific cleanup logic.
     */
    public async cleanup(): Promise<void> {
        // Default: no-op - override in derived classes if cleanup is needed
    }
}

// Singleton instance that will be initialized and used throughout the application
// This can be replaced with a cloud-specific instance (e.g., azureLockerInstance) during initialization
export let lockerInstance: Locker = new Locker();

/**
 * Set the active locker instance. Used by cloud providers to inject their specific implementation.
 * @param instance - The locker instance to use
 */
export function setLockerInstance(instance: Locker): void {
    lockerInstance = instance;
}
