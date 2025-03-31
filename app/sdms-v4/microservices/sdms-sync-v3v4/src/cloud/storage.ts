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

import { BlobInfo } from '../model';
import { CloudFactory } from './cloud';
import { Error } from '../shared';

export interface IStorage {
    listBlobs(bucketName): Promise<BlobInfo[]>;
}

export abstract class AbstractStorage implements IStorage {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public listBlobs(bucketName: string): Promise<BlobInfo[]> {
        throw Error.make(Error.Status.BAD_REQUEST, 'Method not implemented.');
    }
}

export class StorageFactory extends CloudFactory {
    public static build(providerLabel: string, args: { [key: string]: any } = {}): IStorage {
        return CloudFactory.build(providerLabel, AbstractStorage, args) as IStorage;
    }
}
