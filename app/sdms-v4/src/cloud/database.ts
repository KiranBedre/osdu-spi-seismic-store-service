// ============================================================================
// Copyright 2017-2024, Schlumberger
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
import { Error } from '../shared';

export interface IDatabase {
    getStorageUrlFromV3Catalogue(
        subproject: string,
        path: string,
        name: string
    ): Promise<{
        bucket: string;
        virtualFolder: string;
    }>;
}

export abstract class AbstractDatabase implements IDatabase {
    /* eslint-disable @typescript-eslint/no-unused-vars */
    public getStorageUrlFromV3Catalogue(
        subproject: string,
        path: string,
        name: string
    ): Promise<{
        bucket: string;
        virtualFolder: string;
    }> {
        throw Error.make(Error.Status.NOT_IMPLEMENTED, 'Method not implemented.');
    }
}

export class DatabaseFactory extends CloudFactory {
    public static build(providerLabel: string, args: { [key: string]: any } = {}): IDatabase {
        return CloudFactory.build(providerLabel, AbstractDatabase, args) as IDatabase;
    }
}
