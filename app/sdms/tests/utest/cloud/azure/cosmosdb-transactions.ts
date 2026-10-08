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

import sinon from 'sinon';

import { AzureCosmosDbTransactionDAO, AzureCosmosDbDAO, AzureCosmosDbQuery, AzureCosmosDbTransactionOperation } from '../../../../src/cloud/providers/azure/cosmosdb';
import { Config } from '../../../../src/cloud';
import { IJournal, IJournalQueryModel } from '../../../../src/cloud/journal';
import { Tx } from '../../utils';
import { assert } from 'chai';
import { SqlQuerySpec, FeedOptions } from '@azure/cosmos';

export class TestAzureCosmosDbTransactionDAO {
    private static sandbox: sinon.SinonSandbox;

    public static run() {

        describe(Tx.testInit('azure cosmos db transaction dao tests'), () => {
            this.sandbox = sinon.createSandbox();

            beforeEach(() => {
                this.sandbox.define(Config, 'CLOUDPROVIDER', 'azure');
            });

            afterEach(() => {
                this.sandbox.restore();
            });

            this.testGet();
            this.testSave();
            this.testDelete();
            this.testCreateQuery();
            this.testRun();
            this.testRunWithInvalidState();
            this.testRollback();
            this.testCommit();
        });
    }

    private static testGet() {
        Tx.sectionInit('testGet');
        // This test validates pass-through of get() calls to the underlying non-transactional journal
        Tx.test(async () => {
            // setup
            const expectedKey = 'myKey';
            const expectedResult: [any] = ['mySingleResult'];
            const journalStub = {
                get(key: any): Promise<[any | any[]]> {
                    if (key !== expectedKey) {
                        throw new Error(`TEST FAILURE: Unexpected Parameter: '${key}' != '${expectedKey}'`);
                    }
                    return Promise.resolve(expectedResult);
                }
            } as IJournal;
            const subject = new AzureCosmosDbTransactionDAO(journalStub as AzureCosmosDbDAO);
            const anyKey = 'myKey';
            // act
            const actual = await subject.get(anyKey);
            // assert
            assert.sameDeepMembers(actual, expectedResult);
        });
    }

    private static testSave() {
        Tx.sectionInit('testSave');
        // This test validates queuing the save operation to an internal pending ops queue
        Tx.test(async () => {
            try {
                // setup
                const entity = {
                    id: '0'
                };
                const journalStub = {
                } as IJournal;
                const subject = new AzureCosmosDbTransactionDAO(journalStub as AzureCosmosDbDAO);
                // act
                await subject.save(entity);
                // assert
                assert.deepEqual(subject.queuedOperations, [ new AzureCosmosDbTransactionOperation('save', entity) ]);
            }
            finally {
            }
        });
    }

    private static testDelete() {
        Tx.sectionInit('testDelete');
        // This test validates queuing the delete operation to an internal pending ops queue
        Tx.test(async () => {
            try {
                // setup
                const key = '0';
                const journalStub = {
                } as IJournal;
                const subject = new AzureCosmosDbTransactionDAO(journalStub as AzureCosmosDbDAO);
                // act
                await subject.delete(key);
                // assert
                assert.deepEqual(subject.queuedOperations, [ new AzureCosmosDbTransactionOperation('delete', key) ]);
            }
            finally {
            }
        });
    }

    private static testCreateQuery() {
        Tx.sectionInit('testCreateQuery');
        // This test validates pass-through of createQuery() calls to the underlying non-transactional journal
        Tx.test(() => {
            try {
                // setup
                const expectedNamespace = 'myNamespace';
                const expectedKind = Config.DATASETS_KIND;
                const expectedResult = {} as IJournalQueryModel;
                const journalStub = {
                    createQuery(namespace: string, kind: string): IJournalQueryModel {
                        if (namespace !== expectedNamespace) {
                            throw new Error(`TEST FAILURE: Unexpected Parameter: '${namespace}' != '${expectedNamespace}'`);
                        }
                        if (kind !== expectedKind) {
                            throw new Error(`TEST FAILURE: Unexpected Parameter: '${kind}' != '${expectedKind}'`);
                        }
                        return expectedResult;
                    }
                } as IJournal;
                const subject = new AzureCosmosDbTransactionDAO(journalStub as AzureCosmosDbDAO);
                // act
                const actual = subject.createQuery(expectedNamespace, expectedKind) as AzureCosmosDbQuery;
                // assert
                assert.deepEqual(actual, expectedResult);
            }
            finally {
            }
        });
    }

    private static testRun() {
        Tx.sectionInit('testRun');
        // This test validates that the run() operation behaves correctly depending on internal pending ops queue state
        Tx.test(async () => {
            try {
                // setup
                const journalStub = {
                } as IJournal;
                const subject = new AzureCosmosDbTransactionDAO(journalStub as AzureCosmosDbDAO);
                // act
                await subject.run(); // fails if queue already contains ops
                // assert
                assert.deepEqual(subject.queuedOperations, []);
            }
            finally {
            }
        });
    }

    private static testRunWithInvalidState() {
        Tx.sectionInit('testRunWithInvalidState');
        // This test validates that the run() operation behaves correctly depending on internal pending ops queue state
        Tx.test(async () => {
            try {
                // setup
                const entity = { id : 'foo' };
                const journalStub = {
                } as IJournal;
                const subject = new AzureCosmosDbTransactionDAO(journalStub as AzureCosmosDbDAO);
                await subject.save(entity);
                assert.deepEqual(subject.queuedOperations, [ new AzureCosmosDbTransactionOperation('save', entity) ]);
                // act
                await subject.run(); // fails if queue already contains ops
                // assert
                assert.fail('Negative Test failed to produce the expected error.')
            }
            catch(err) {
                if (err !== 'Transaction is already in use.')
                {
                    throw err;
                }
            }
            finally {
            }
        });
    }

    private static testRollback() {
        Tx.sectionInit('testRollback');
        // This test validates that the rollback() operation behaves correctly depending
        // on internal pending ops queue state
        Tx.test(async () => {
            try {
                // setup
                const entity = { id : 'foo' };
                const key = 'foo';
                const journalStub = {
                } as IJournal;
                const subject = new AzureCosmosDbTransactionDAO(journalStub as AzureCosmosDbDAO);
                // act
                await subject.run();
                await subject.save(entity);
                await subject.delete(key);
                assert.deepEqual(subject.queuedOperations, [
                    new AzureCosmosDbTransactionOperation('save', entity),
                    new AzureCosmosDbTransactionOperation('delete', key)
                ]);
                await subject.rollback();
                // assert
                assert.deepEqual(subject.queuedOperations, []);
            }
            finally {
            }
        });
    }

// subject change in entitlement

    private static testCommit() {
        Tx.sectionInit('testCommit');
        // This test validates that the commit() operation behaves correctly depending on
        // internal pending ops queue state
        // The internal pending ops should be replayed against the underlying journal as a batch
        Tx.test(async () => {
            try {
                // setup
                const expectedEntity = { id : 'foo' };
                const expectedKey = 'foo';
                let saveCalls = 0;
                let deleteCalls = 0;
                const journalStub = {
                    save(entity: any): Promise<void> {
                        if (entity !== expectedEntity) {
                            throw new Error(`TEST FAILURE: Unexpected Parameter: '${entity}' != '${expectedEntity}'`);
                        }
                        saveCalls++;
                        return Promise.resolve();
                    },
                    delete(key: any): Promise<void> {
                        if (key !== expectedKey) {
                            throw new Error(`TEST FAILURE: Unexpected Parameter: '${key}' != '${expectedKey}'`);
                        }
                        deleteCalls++;
                        return Promise.resolve();
                    }
                } as IJournal;
                const subject = new AzureCosmosDbTransactionDAO(journalStub as AzureCosmosDbDAO);
                // act
                await subject.run();
                await subject.save(expectedEntity);
                await subject.delete(expectedKey);
                assert.deepEqual(subject.queuedOperations, [
                    new AzureCosmosDbTransactionOperation('save', expectedEntity),
                    new AzureCosmosDbTransactionOperation('delete', expectedKey)
                ]);
                await subject.commit();
                // assert
                assert.deepEqual(subject.queuedOperations, []);
                assert.equal(saveCalls, 1);
                assert.equal(deleteCalls, 1);
            }
            finally {
            }
        });
    }
}
