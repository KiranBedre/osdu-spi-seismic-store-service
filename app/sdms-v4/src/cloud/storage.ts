// ============================================================================
// Copyright 2017-2022, Schlumberger
//
// Licensed under the Apache License, Version 2.0 (the "License");
// You may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// Distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// Limitations under the License.
// ============================================================================

import { CloudFactory } from './cloud';

export interface IStorage {
    createBucket(bucketName: string, metadata?: { [key: string]: string }): Promise<void>;
    bucketExists(bucketName: string): Promise<boolean>;
    deleteBucket(bucketName: string): Promise<void>;
}

export abstract class AbstractStorage implements IStorage {
    public abstract createBucket(bucketName: string, metadata?: { [key: string]: string }): Promise<void>;
    public abstract bucketExists(bucketName: string): Promise<boolean>;
    public abstract deleteBucket(bucketName: string): Promise<void>;
}

export class StorageFactory extends CloudFactory {
    public static build(providerLabel: string, args: { [key: string]: any } = {}): IStorage {
        return CloudFactory.build(providerLabel, AbstractStorage, args) as IStorage;
    }
}
