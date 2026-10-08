// ============================================================================
// Copyright 2017-2023, Schlumberger
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

import { Tx } from '../utils';
import { TestGoogleCredentials } from './google/credentials';
import { TestGoogleDatastoreDAO, TestGoogleDatastoreTransactionDAO } from './google/datastore';
import { TestGCDatastoreDAO, TestGCDatastoreTransactionDAO } from './gc/datastore';
import { TestAzureCosmosDbDAO } from './azure/cosmosdb';
import { TestAzureCosmosDbTransactionDAO } from './azure/cosmosdb-transactions';
import { TestAzureCosmosDbListDatasets} from './azure/cosmosdb-list-datasets';
import { TestAzureDatasetPostProcessor } from './azure/postprocessor';
import { TestGCSCore } from './google/gcs';
import { TestAzureKeyVault } from './azure/keyvault';
import { TestAzureStorage } from './azure/cloudstorage';
import { TestDataEcoSystem } from './google/dataecosystem';
import { TestTaskQueue } from "./azure/taskQueue";
import { TestStorageFactory } from './storagefactory';
import { TestStorageJobManager } from './shared/queue.test';
import { TestMSITokenProvider } from './azure/msi-token-provider';
import { TestAzureArchiveService } from './azure/archive-service';
import { TestAzureRestoreOperationStatus } from './azure/restore-operation-status';
import { TestAzureDataEcosystemServices } from './azure/dataecosystem';
export class TestCloud {

    public static run() {

        describe(Tx.title('utest seismic store - cloud core'), () => {
            TestGoogleCredentials.run();
            TestGCSCore.run();
            TestGCDatastoreDAO.run();
            TestGCDatastoreTransactionDAO.run();
            TestGoogleDatastoreDAO.run();
            TestGoogleDatastoreTransactionDAO.run();
            TestAzureCosmosDbDAO.run();
            TestAzureCosmosDbListDatasets.run();
            TestAzureCosmosDbTransactionDAO.run();
            TestAzureDatasetPostProcessor.run();
            TestAzureKeyVault.run();
            TestAzureStorage.run();
            TestDataEcoSystem.run();
            TestTaskQueue.run();
            TestStorageFactory.run();
            TestStorageJobManager.run();
            TestMSITokenProvider.run();
            TestAzureDataEcosystemServices.run();
            TestAzureArchiveService.run();
            TestAzureRestoreOperationStatus.run();
        });
    }
}
