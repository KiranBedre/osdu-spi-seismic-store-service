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
import { TestGCSCore } from './google/gcs';
import { TestAzureKeyVault } from './azure/keyvault';
import { TestAzureStorage } from './azure/cloudstorage';
import { TestDataEcoSystem } from './google/dataecosystem';
import { TestAWSCredentials } from './aws/credentials';
import {TestAWSSeistore} from './aws/seistore';
import { TestAWSSSMHelper } from './aws/ssmhelper';
import { TestAWSDataEcosystem } from './aws/dataecosystem';
import { TestStorage } from './aws/storage';
import { TestLogger } from './aws/logger';
import { TestAWSDynamoDB, TestAWSDynamoDbTransactionDAO, TestAWSDynamoDbQuery } from './aws/dynamodb';
import { TestAWSStsHelper } from './aws/stshelper';
import { TestAwsTrace } from './aws/trace';
import { TestTaskQueue } from "./azure/taskQueue";
export class TestCloud {

    public static run() {

        describe(Tx.title('utest seismic store - cloud core'), () => {
            TestLogger.run();
            TestStorage.run();
            TestAWSCredentials.run();
            TestAWSDynamoDbQuery.run();
            TestAWSDynamoDB.run();
            TestAWSDynamoDbTransactionDAO.run();
            TestAWSSSMHelper.run();
            TestAWSDataEcosystem.run();
            TestAwsTrace.run();
            TestAWSSeistore.run();
            TestAWSStsHelper.run();
            TestGoogleCredentials.run();
            TestGCSCore.run();
            TestGCDatastoreDAO.run();
            TestGCDatastoreTransactionDAO.run()
            TestGoogleDatastoreDAO.run();
            TestGoogleDatastoreTransactionDAO.run();
            TestAzureCosmosDbDAO.run();
            TestAzureCosmosDbListDatasets.run();
            TestAzureCosmosDbTransactionDAO.run();
            TestAzureKeyVault.run();
            TestAzureStorage.run();
            TestDataEcoSystem.run();
            TestTaskQueue.run();
        });

    }

}
