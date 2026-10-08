// ============================================================================
// Copyright 2017-2019, Schlumberger
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

import { Datastore, Query, Transaction } from '@google-cloud/datastore';
import { TenantModel } from '../../../services/tenant';
import {
    AbstractJournal, AbstractJournalTransaction,
    IJournalQueryModel, IJournalTransaction, JournalFactory
} from '../../journal';
import { ConfigGoogle } from './config';

// a wrapper class for google datastore
@JournalFactory.register('google')
export class DatastoreDAO extends AbstractJournal {

    public KEY = Datastore.KEY;
    private projectID: string;

    private static clientsCache: { [key: string]: Datastore; } = {};

    public constructor(tenant: TenantModel) {

        super();
        this.projectID = tenant ? tenant.gcpid : ConfigGoogle.SERVICE_CLOUD_PROJECT;
    }

    private getDataStoreClient() {
        if (DatastoreDAO.clientsCache[this.projectID]) {
            return DatastoreDAO.clientsCache[this.projectID];
        } else {
            DatastoreDAO.clientsCache[this.projectID] = new Datastore({
                keyFilename: ConfigGoogle.SERVICE_IDENTITY_KEY_FILENAME,
                projectId: this.projectID,
            });
            return DatastoreDAO.clientsCache[this.projectID];
        }
    }

    public async save(datasetEntity: any): Promise<void> {
        await this.getDataStoreClient().save(datasetEntity);
    }

    public async get(key: any): Promise<[any | any[]]> {
        return await this.getDataStoreClient().get(key);
    }

    public async delete(key: any): Promise<void> {
        await this.getDataStoreClient().delete(key);
    }

    public createQuery(namespace: string, kind: string): IJournalQueryModel {
        return this.getDataStoreClient().createQuery(namespace, kind);
    }

    public async runQuery(query: IJournalQueryModel): Promise<[any[], { endCursor?: string; }]> {
        const results = await this.getDataStoreClient().runQuery(query as Query);
        const info = results[1];

        if (info.moreResults === Datastore.NO_MORE_RESULTS) {
            return [
                results[0],
                {
                    endCursor: ''
                }
            ];
        }
        return results;
    }

    public createKey(specs: any): object {
        if (specs.enforcedKey) {
            specs.path.push(specs.enforcedKey);
        }
        return this.getDataStoreClient().key(specs);
    }

    public getTransaction(): IJournalTransaction {
        return new DatastoreTransactionDAO(this.getDataStoreClient().transaction());
    }

    public getQueryFilterSymbolContains(): string {
        return '=';
    }

}

// a wrapper class for datastore transactions
export class DatastoreTransactionDAO extends AbstractJournalTransaction {

    public transaction: Transaction;
    public KEY = Datastore.KEY;

    public constructor(transaction: Transaction) {
        super();
        this.transaction = transaction;
    }

    public async save(entity: any): Promise<void> {
        await this.transaction.save(entity);
    }

    public async get(key: any): Promise<[any | any[]]> {
        return await this.transaction.get(key);
    }

    public async delete(key: any): Promise<void> {
        await this.transaction.delete(key);
    }

    public createQuery(namespace: string, kind: string): IJournalQueryModel {
        return this.transaction.createQuery(namespace, kind);
    }

    public async runQuery(query: Query): Promise<[any[], { endCursor?: string; }]> {
        return await this.transaction.runQuery(query);
    }

    public async run(): Promise<void> {
        await this.transaction.run();
    }

    public async rollback(): Promise<void> {
        await this.transaction.rollback();
    }

    public async commit(): Promise<void> {
        await this.transaction.commit();
    }

    public getQueryFilterSymbolContains(): string {
        return '=';
    }
}
