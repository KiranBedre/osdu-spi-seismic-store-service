// ============================================================================
// Copyright 2017-2024, Schlumberger
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
import { describe } from 'mocha';
import { StorageFactory } from '../../../src/cloud/storage';
import { Tx } from '../utils';

export class TestStorageFactory {

    public static run() {

        describe(Tx.testInit('StorageFactory test'), () => {

            this.getDefaultTier();

        });
    }

    private static getDefaultTier() {
        Tx.sectionInit('getDefaultTier');

        Tx.test(() => {
            const tier = StorageFactory.getDefaultTier('azure');
            expect(tier).to.equal('Hot');
        });

        Tx.test(() => {
            const tier = StorageFactory.getDefaultTier('Azure');
            expect(tier).to.equal('Hot');
        });

        Tx.test(() => {
            const tier = StorageFactory.getDefaultTier('AZURE');
            expect(tier).to.equal('Hot');
        });

        Tx.test(() => {
            const tier = StorageFactory.getDefaultTier('google');
            expect(tier).to.be.undefined;
        });

        Tx.test(() => {
            const tier = StorageFactory.getDefaultTier('aws');
            expect(tier).to.be.undefined;
        });

        Tx.test(() => {
            const tier = StorageFactory.getDefaultTier('unknown');
            expect(tier).to.be.undefined;
        });

        Tx.test(() => {
            const tier = StorageFactory.getDefaultTier('');
            expect(tier).to.be.undefined;
        });
    }

}
