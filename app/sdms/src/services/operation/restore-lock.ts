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

import { Config, LoggerFactory } from '../../cloud';
import { lockerInstance } from '../dataset/locker';

/**
 * Distributed lock for restore operations using Redis SET NX.
 * Ensures only one restore operation runs per data partition at a time.
 *
 * Lock key: restore-op-lock:{dataPartitionId}
 * Lock value: operationId (for idempotent re-acquisition by the worker)
 * TTL: Configurable via SDMS_RESTORE_LOCK_TTL_SECONDS (default 2 hours)
 */
export class RestoreOperationLock {

    private static get logger() { return LoggerFactory.build(Config.CLOUDPROVIDER); }
    private static readonly LOCK_KEY_PREFIX = 'restore-op-lock:';
    private static readonly CONTEXT = 'RestoreOperationLock';

    /**
     * Attempts to acquire the restore lock for a data partition.
     * @param tenant - The data partition ID
     * @param operationId - The restore operation ID (used as lock value for idempotency)
     * @returns true if lock was acquired, false if another operation holds it
     */
    public static async acquire(tenant: string, operationId: string): Promise<boolean> {
        const key = this.getLockKey(tenant);
        const ttl = Config.SDMS_RESTORE_LOCK_TTL_SECONDS;

        const result = await lockerInstance.setNX(key, operationId, ttl);
        if (result === 'OK') {
            this.logger.info({
                message: `Restore lock acquired for partition ${tenant}`,
                context: this.CONTEXT,
                operationId,
                ttl
            });
            return true;
        }

        this.logger.info({
            message: `Restore lock not acquired for partition ${tenant} - already held`,
            context: this.CONTEXT,
            operationId
        });
        return false;
    }

    /**
     * Releases the restore lock only if the value matches the operationId (safe release).
     * @param tenant - The data partition ID
     * @param operationId - The operation ID that holds the lock
     * @returns true if lock was released, false if value didn't match or lock expired
     */
    public static async release(tenant: string, operationId: string): Promise<boolean> {
        const key = this.getLockKey(tenant);
        const released = await lockerInstance.delIfMatch(key, operationId);

        if (released) {
            this.logger.info({
                message: `Restore lock released for partition ${tenant}`,
                context: this.CONTEXT,
                operationId
            });
        }
        return released;
    }

    /**
     * Gets the current lock holder (operationId) for a data partition.
     * @returns The operationId holding the lock, or null if no lock is held
     */
    public static async getHolder(tenant: string): Promise<string | null> {
        const key = this.getLockKey(tenant);
        const value = await lockerInstance.getLock(key);
        return typeof value === 'string' ? value : null;
    }

    private static getLockKey(tenant: string): string {
        return `${this.LOCK_KEY_PREFIX}${tenant}`;
    }
}
