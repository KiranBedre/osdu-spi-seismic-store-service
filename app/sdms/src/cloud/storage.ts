// ============================================================================
// Copyright 2017-2025, Schlumberger
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

import { CloudFactory } from './cloud';
import { Error } from '../shared';
import { Config } from './config';

export interface IStorage {
    createBucket(
        bucketName: string, location: string, storageClass: string): Promise<void>;
    deleteBucket(bucketName: string): Promise<void>;
    deleteBucket(bucketName: string): void;
    bucketExists(bucketName: string): Promise<boolean>;
    deleteFiles(bucketName: string): Promise<void>;
    deleteObjects(bucketName: string, prefix: string): Promise<void>;
    saveObject(bucketName: string, objectName: string, data: string): Promise<void>;
    copy(bucketIn: string, prefixIn: string, bucketOut: string, prefixOut: string, ownerEmail: string): Promise<void>;
    randomBucketName(): Promise<string>;
    getStorageTiers(): string[];
    checkTier(bucketName: string, prefix: string): Promise<string>;
    getObjectSize(bucketName: string, prefix?: string): Promise<number>;
    setStorageTiers(bucketName: string, prefix: string, tierId: string): Promise<void>;
    getStorageAccountRedundancy(): Promise<string>;
    checkSupportedTier(tierId: string): Promise<void>;
    listBlobs(prefix: string, bucketName): Promise<string[]>;
    listBlobsFilter(bucketName: string, filter?: string): Promise<string[]>;
}

export abstract class AbstractStorage implements IStorage {
    public abstract createBucket(
        bucketName: string, location: string, storageClass: string): Promise<void>;
    public abstract deleteBucket(bucketName: string): Promise<void>;
    public abstract bucketExists(bucketName: string): Promise<boolean>;
    public abstract deleteFiles(bucketName: string): Promise<void>;
    public abstract deleteObjects(bucketName: string, prefix: string): Promise<void>;
    public abstract saveObject(bucketName: string, objectName: string, data: string): Promise<void>;
    public abstract copy(
        bucketIn: string, prefixIn: string, bucketOut: string,
        prefixOut: string, ownerEmail: string): Promise<void>;
    public abstract randomBucketName(): Promise<string>;
    public getStorageTiers(): string[] {
        throw (Error.make(Error.Status.NOT_IMPLEMENTED, 'Method not implemented.'));
    }
    public getObjectSize(bucketName: string, prefix?: string): Promise<number> {
        throw (Error.make(Error.Status.NOT_IMPLEMENTED, 'Method not implemented.'));
    };
    public setStorageTiers(bucketName: string, prefix: string, tierId: string): Promise<void> {
        // eslint-disable-next-line @stylistic/max-len
        throw (Error.make(Error.Status.NOT_IMPLEMENTED, 'Method not implemented. Storage Tier change is not supported in ' + Config.CLOUDPROVIDER));
    };
    public checkTier(bucketName: string, prefix: string): Promise<string> {
        // eslint-disable-next-line @stylistic/max-len
        throw (Error.make(Error.Status.NOT_IMPLEMENTED, 'Method not implemented. Storage Tier Check is not supported in ' + Config.CLOUDPROVIDER));
    };
    getStorageAccountRedundancy(): Promise<string> {
        throw (Error.make(Error.Status.NOT_IMPLEMENTED, 'Method not implemented.'));
    };
    public checkSupportedTier(tierId: string): Promise<void> {
        // eslint-disable-next-line @stylistic/max-len
        throw (Error.make(Error.Status.NOT_IMPLEMENTED, 'Method not implemented. Storage Tier change is not supported in ' + Config.CLOUDPROVIDER));
    }
    public listBlobs(prefix: string, bucketName: string): Promise<string[]> {
        throw (Error.make(Error.Status.BAD_REQUEST, 'Method not implemented.'));
    };
    public listBlobsFilter(bucketName: string, filter?: string): Promise<string[]> {
        throw (Error.make(Error.Status.BAD_REQUEST, 'Method not implemented.'));
    };

}

export class StorageFactory extends CloudFactory {
    public static build(providerLabel: string, args: { [key: string]: any; } = {}): IStorage {
        return CloudFactory.build(providerLabel, AbstractStorage, args) as IStorage;
    }
}
