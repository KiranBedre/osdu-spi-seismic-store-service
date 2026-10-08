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

import { Config, ConfigFactory } from '../../config';
import { AzureInsightsLogger } from './insights';
import { KeyVault } from './keyvault';

@ConfigFactory.register('azure')
export class AzureConfig extends Config {

    // Application resource id
    public static APP_RESOURCE_ID: string;

    // Azure Storage Queue (task queues for the long-running operations)
    public static AZURE_STORAGE_QUEUE_ENDPOINT: string;

    // Connection String
    public static AI_CONNECTION_STRING: string;
    public static CORRELATION_ID = 'correlation-id';

    // KeyVault id
    public static KEYVAULT_URL: string;

    // Apis base url path
    public static API_VERSION = 'v3';
    public static API_BASE_URL_PATH = '/seistore-svc/api/' + AzureConfig.API_VERSION;

    // MSI Redis authentication
    public static AZURE_MSI_ISENABLED: boolean;

    /**
     * Helper to determine if MSI authentication should be used for Redis
     * @returns true if MSI is enabled AND not in unit test mode
     */
    public static shouldUseMsiAuth(): boolean {
        return !Config.UTEST && this.AZURE_MSI_ISENABLED;
    }

    // max len for a group name in DE
    public static DES_GROUP_CHAR_LIMIT = 256;

    // cosmo db max throughput settings
    public static COSMO_MAX_THROUGHPUT: number;
    public static COSMO_CHANGE_TIER_MAX_THROUGHPUT: number;
    public static COSMO_ARCHIVE_MAX_THROUGHPUT: number;
    public static COSMO_RESTORE_STATUS_MAX_THROUGHPUT: number;

    // Cosmos DB database and container names
    public static COSMOS_DATABASE_ID = 'sdms-db';
    public static COSMOS_DATA_CONTAINER = 'data';
    public static COSMOS_CHANGE_TIER_STATUS_CONTAINER = 'ChangeTierOperationStatus';
    public static COSMOS_CHANGE_TIER_FAILURE_CONTAINER = 'ChangeTierFailure';
    public static COSMOS_RESTORE_STATUS_CONTAINER = 'RestoreOperationStatus';
    public static COSMOS_ARCHIVE_CONTAINER = 'ArchiveDatasetMetadata';
    public static COSMOS_RESTORE_STATUS_PARTITION_KEY = '/operationId';
    public static COSMOS_ARCHIVE_PARTITION_KEY = '/sdPath';

    // Archive TTL derived from restore max days (Config.SDMS_RESTORE_MAX_DAYS)
    public static get COSMOS_ARCHIVE_TTL_SECONDS(): number {
        const maxDays = Config.SDMS_RESTORE_MAX_DAYS;
        const validDays = Number.isInteger(maxDays) && maxDays > 0 ? maxDays : 30;
        return validDays * 24 * 60 * 60;
    }

    // Dataset entity ID prefix — only entities with this prefix are archived
    public static DATASET_ENTITY_PREFIX = 'ds-';

    // Cosmos DB partition key paths
    public static COSMOS_PARTITION_KEY_ID = '/id';
    public static COSMOS_PARTITION_KEY_OPERATION_ID = '/operationId';
    public static COSMOS_PARTITION_KEY_SDPATH = '/sdPath';

    // internal logging
    public static ENABLE_LOGGING_INFO: boolean;
    public static ENABLE_LOGGING_ERROR: boolean;
    public static ENABLE_LOGGING_METRIC: boolean;

    // SideCar
    public static SIDECAR_URL: string;
    public static SIDECAR_ENABLE_QUERY: boolean;

    public async init(): Promise<void> {


        try {

            // set up secrets from Azure KeyVault
            AzureConfig.KEYVAULT_URL = process.env.KEYVAULT_URL;
            Config.checkRequiredConfig(AzureConfig.KEYVAULT_URL, 'KEYVAULT_URL');
            await KeyVault.loadSecrets(KeyVault.CreateSecretClient());

            // data ecosystem host url and appkey
            AzureConfig.DES_SERVICE_HOST_COMPLIANCE = process.env.DES_SERVICE_HOST_COMPLIANCE ||
                process.env.DES_SERVICE_HOST;
            AzureConfig.DES_SERVICE_HOST_ENTITLEMENT = process.env.DES_SERVICE_HOST_ENTITLEMENT ||
                process.env.DES_SERVICE_HOST;
            AzureConfig.DES_SERVICE_HOST_STORAGE = process.env.DES_SERVICE_HOST_STORAGE ||
                process.env.DES_SERVICE_HOST;
            AzureConfig.DES_SERVICE_HOST_PARTITION = process.env.DES_SERVICE_HOST_PARTITION ||
                process.env.DES_SERVICE_HOST;
            AzureConfig.DES_POLICY_SERVICE_HOST = process.env.DES_POLICY_SERVICE_HOST ||
                process.env.DES_SERVICE_HOST;
            AzureConfig.DES_SERVICE_APPKEY = process.env.SEISTORE_DES_APPKEY || 'undefined';
            AzureConfig.CCM_SERVICE_URL = process.env.CCM_SERVICE_URL;
            AzureConfig.CCM_TOKEN_SCOPE = process.env.CCM_TOKEN_SCOPE;
            Config.checkRequiredConfig(AzureConfig.DES_SERVICE_HOST_COMPLIANCE, 'DES_SERVICE_HOST_COMPLIANCE');
            Config.checkRequiredConfig(AzureConfig.DES_SERVICE_HOST_ENTITLEMENT, 'DES_SERVICE_HOST_ENTITLEMENT');
            Config.checkRequiredConfig(AzureConfig.DES_SERVICE_HOST_STORAGE, 'DES_SERVICE_HOST_STORAGE');
            Config.checkRequiredConfig(AzureConfig.DES_SERVICE_HOST_PARTITION, 'DES_SERVICE_HOST_PARTITION');
            Config.checkRequiredConfig(AzureConfig.DES_SERVICE_APPKEY, 'DES_SERVICE_APPKEY');

            // the email of the service identity used to sign an impersonation token
            // to restore when the impersonation token for azure will be implemented
            // (await client.getSecret(this.IMP_SERVICE_ACCOUNT_SIGNER)).value;
            AzureConfig.IMP_SERVICE_ACCOUNT_SIGNER = 'not@implemented,tester-carbon.slbservice.com';

            // MSI Redis authentication configuration
            AzureConfig.AZURE_MSI_ISENABLED = process.env.AZURE_MSI_ISENABLED === 'true';

            // redis cache port for locks (the port as env variable)
            AzureConfig.LOCKSMAP_REDIS_INSTANCE_PORT = +process.env.REDIS_INSTANCE_PORT;
            AzureConfig.LOCKSMAP_REDIS_INSTANCE_ADDRESS = process.env.REDIS_INSTANCE_ADDRESS ||
                AzureConfig.LOCKSMAP_REDIS_INSTANCE_ADDRESS;
            AzureConfig.LOCKSMAP_REDIS_INSTANCE_TLS_DISABLE =
                process.env.REDIS_INSTANCE_TLS_DISABLE === 'true';  // enabled by default
            AzureConfig.LOCKSMAP_REDIS_INSTANCE_KEY = process.env.REDIS_INSTANCE_KEY ||
                AzureConfig.LOCKSMAP_REDIS_INSTANCE_KEY;
            Config.checkRequiredConfig(AzureConfig.LOCKSMAP_REDIS_INSTANCE_PORT, 'REDIS_INSTANCE_PORT');
            Config.checkRequiredConfig(AzureConfig.LOCKSMAP_REDIS_INSTANCE_ADDRESS, 'REDIS_INSTANCE_ADDRESS');

            // Conditional validation based on authentication method
            if (!AzureConfig.AZURE_MSI_ISENABLED) {
                Config.checkRequiredConfig(AzureConfig.LOCKSMAP_REDIS_INSTANCE_KEY, 'REDIS_INSTANCE_KEY');
            }

            // redis shared
            AzureConfig.REDIS_SHARED_INSTANCE_KEY = process.env.REDIS_SHARED_INSTANCE_KEY ||
                AzureConfig.REDIS_SHARED_INSTANCE_KEY;
            AzureConfig.REDIS_SHARED_INSTANCE_ADDRESS = process.env.REDIS_SHARED_INSTANCE_ADDRESS ||
                AzureConfig.REDIS_SHARED_INSTANCE_ADDRESS;
            AzureConfig.REDIS_SHARED_INSTANCE_PORT = +process.env.REDIS_SHARED_INSTANCE_PORT || 6380;
            AzureConfig.REDIS_SHARED_INSTANCE_TLS_DISABLE =
                process.env.REDIS_SHARED_INSTANCE_TLS_DISABLE === 'true';  // enabled by default

            // deletion operation status queue
            AzureConfig.SMDS_DELETION_QUEUE = process.env.SMDS_DELETION_QUEUE ||
                AzureConfig.SMDS_DELETION_QUEUE || 'sdms-queue-bulkdelete';

            // change tier operation status queue
            AzureConfig.SDMS_CHANGE_TIER_QUEUE = process.env.SDMS_CHANGE_TIER_QUEUE ||
                AzureConfig.SDMS_CHANGE_TIER_QUEUE || 'sdms-queue-changetier';

            // restore operation queue
            AzureConfig.SDMS_RESTORE_QUEUE = process.env.SDMS_RESTORE_QUEUE ||
                AzureConfig.SDMS_RESTORE_QUEUE || 'sdms-queue-restore';

            // storage queue endpoint
            AzureConfig.AZURE_STORAGE_QUEUE_ENDPOINT = AzureConfig.AZURE_STORAGE_QUEUE_ENDPOINT ||
                process.env.AZURE_STORAGE_QUEUE_ENDPOINT;
            Config.checkRequiredConfig(AzureConfig.AZURE_STORAGE_QUEUE_ENDPOINT, 'AZURE_STORAGE_QUEUE_ENDPOINT');

            // dateset compute size queue
            AzureConfig.SDMS_COMPUTE_SIZE_QUEUE = process.env.SDMS_COMPUTE_SIZE_QUEUE ||
                AzureConfig.SDMS_COMPUTE_SIZE_QUEUE || 'sdms-queue-computesize';

            // set the auth provider
            AzureConfig.SERVICE_AUTH_PROVIDER = process.env.SERVICE_AUTH_PROVIDER;
            AzureConfig.SERVICE_AUTH_PROVIDER_CREDENTIAL = // If not set as secret try to load from envs
                AzureConfig.SERVICE_AUTH_PROVIDER_CREDENTIAL || process.env.SERVICE_AUTH_PROVIDER_CREDENTIAL;

            // cosmo throughput settings
            AzureConfig.COSMO_MAX_THROUGHPUT = +process.env.COSMO_MAX_THROUGHPUT || 40000;
            AzureConfig.COSMO_CHANGE_TIER_MAX_THROUGHPUT = +process.env.COSMO_CHANGE_TIER_MAX_THROUGHPUT || 4000;
            // Archive is written on every dataset mutation; restore status is low volume.
            AzureConfig.COSMO_ARCHIVE_MAX_THROUGHPUT = +process.env.COSMO_ARCHIVE_MAX_THROUGHPUT || 4000;
            AzureConfig.COSMO_RESTORE_STATUS_MAX_THROUGHPUT = +process.env.COSMO_RESTORE_STATUS_MAX_THROUGHPUT || 4000;

            // logging
            AzureConfig.ENABLE_LOGGING_INFO = process.env.ENABLE_LOGGING_INFO !== 'false'; // enabled by default
            AzureConfig.ENABLE_LOGGING_ERROR = process.env.ENABLE_LOGGING_ERROR !== 'false'; // enabled by default
            AzureConfig.ENABLE_LOGGING_METRIC = process.env.ENABLE_LOGGING_METRIC === 'true'; // disabled by default

            AzureConfig.SIDECAR_URL = process.env.SIDECAR_URL || 'https://localhost:7138';
            AzureConfig.SIDECAR_ENABLE_QUERY = process.env.SIDECAR_ENABLE_QUERY === 'true';

            // set the correlation id
            AzureConfig.CORRELATION_ID = process.env.CORRELATION_ID || AzureConfig.CORRELATION_ID;

            Config.ENABLE_SEARCH_AND_SELECT_CRITERIA_IN_LIST = true;
            Config.ENABLE_ADVANCED_QUERY_FILTERS = true;

            // init generic configurations
            await Config.initServiceConfiguration({
                SERVICE_ENV: process.env.APP_ENVIRONMENT_IDENTIFIER,
                SERVICE_PORT: +process.env.PORT || 5000,
                API_BASE_PATH: process.env.SDMS_PREFIX || AzureConfig.API_BASE_URL_PATH,
                IMP_SERVICE_ACCOUNT_SIGNER: AzureConfig.IMP_SERVICE_ACCOUNT_SIGNER,
                LOCKSMAP_REDIS_INSTANCE_ADDRESS: AzureConfig.LOCKSMAP_REDIS_INSTANCE_ADDRESS,
                LOCKSMAP_REDIS_INSTANCE_PORT: AzureConfig.LOCKSMAP_REDIS_INSTANCE_PORT,
                LOCKSMAP_REDIS_INSTANCE_TLS_DISABLE: AzureConfig.LOCKSMAP_REDIS_INSTANCE_TLS_DISABLE,
                LOCKSMAP_REDIS_INSTANCE_KEY: AzureConfig.LOCKSMAP_REDIS_INSTANCE_KEY,
                REDIS_SHARED_INSTANCE_KEY: AzureConfig.REDIS_SHARED_INSTANCE_KEY,
                REDIS_SHARED_INSTANCE_ADDRESS: AzureConfig.REDIS_SHARED_INSTANCE_ADDRESS,
                REDIS_SHARED_INSTANCE_PORT: AzureConfig.REDIS_SHARED_INSTANCE_PORT,
                REDIS_SHARED_INSTANCE_TLS_DISABLE: AzureConfig.REDIS_SHARED_INSTANCE_TLS_DISABLE,
                SMDS_DELETION_QUEUE: AzureConfig.SMDS_DELETION_QUEUE,
                SDMS_COMPUTE_SIZE_QUEUE: AzureConfig.SDMS_COMPUTE_SIZE_QUEUE,
                SDMS_CHANGE_TIER_QUEUE: AzureConfig.SDMS_CHANGE_TIER_QUEUE,
                SDMS_RESTORE_QUEUE: AzureConfig.SDMS_RESTORE_QUEUE,
                DES_SERVICE_HOST_COMPLIANCE: AzureConfig.DES_SERVICE_HOST_COMPLIANCE,
                DES_SERVICE_HOST_ENTITLEMENT: AzureConfig.DES_SERVICE_HOST_ENTITLEMENT,
                DES_SERVICE_HOST_STORAGE: AzureConfig.DES_SERVICE_HOST_STORAGE,
                DES_SERVICE_HOST_PARTITION: AzureConfig.DES_SERVICE_HOST_PARTITION,
                DES_POLICY_SERVICE_HOST: AzureConfig.DES_POLICY_SERVICE_HOST,
                DES_SERVICE_APPKEY: AzureConfig.DES_SERVICE_APPKEY,
                DES_GROUP_CHAR_LIMIT: AzureConfig.DES_GROUP_CHAR_LIMIT,
                SERVICE_AUTH_PROVIDER: AzureConfig.SERVICE_AUTH_PROVIDER,
                SERVICE_AUTH_PROVIDER_CREDENTIAL: AzureConfig.SERVICE_AUTH_PROVIDER_CREDENTIAL,
                ENFORCE_SCHEMA_BY_KEY: process.env.ENABLE_USAGE_COSMOS_DATABASE_OLD_INDEX !== 'true',
                TENANT_JOURNAL_ON_DATA_PARTITION: true,
                CORRELATION_ID: AzureConfig.CORRELATION_ID,
                ENABLE_SDMS_ID_AUDIENCE_CHECK: process.env.ENABLE_SDMS_ID_AUDIENCE_CHECK !== undefined ?
                    process.env.ENABLE_SDMS_ID_AUDIENCE_CHECK === 'true' : false,
                ENABLE_DE_TOKEN_EXCHANGE: process.env.ENABLE_DE_TOKEN_EXCHANGE !== undefined ?
                    process.env.ENABLE_DE_TOKEN_EXCHANGE === 'true' : false,
                DES_TARGET_AUDIENCE: process.env.DES_TARGET_AUDIENCE,
                FEATURE_FLAG_SEISMICMETA_STORAGE: process.env.FEATURE_FLAG_SEISMICMETA_STORAGE !== undefined ?
                    process.env.FEATURE_FLAG_SEISMICMETA_STORAGE !== 'false' : true,
                FEATURE_FLAG_IMPTOKEN: process.env.FEATURE_FLAG_IMPTOKEN !== undefined ?
                    process.env.FEATURE_FLAG_IMPTOKEN !== 'false' : true,
                FEATURE_FLAG_TRACE: process.env.FEATURE_FLAG_TRACE !== undefined ?
                    process.env.FEATURE_FLAG_TRACE !== 'false' : true,
                FEATURE_FLAG_LOGGING: process.env.FEATURE_FLAG_LOGGING !== undefined ?
                    process.env.FEATURE_FLAG_LOGGING !== 'false' : true,
                FEATURE_FLAG_STACKDRIVER_EXPORTER: process.env.FEATURE_FLAG_STACKDRIVER_EXPORTER !== undefined ?
                    process.env.FEATURE_FLAG_STACKDRIVER_EXPORTER !== 'false' : true,
                FEATURE_FLAG_CCM_INTERACTION: process.env.FEATURE_FLAG_CCM_INTERACTION ?
                    process.env.FEATURE_FLAG_CCM_INTERACTION === 'true' : false,
                FEATURE_FLAG_POLICY_SVC_INTERACTION: process.env.FEATURE_FLAG_POLICY_SVC_INTERACTION === 'true',
                FEATURE_FLAG_POST_PROCESS_ON_DATASET_CLOSE:
                    process.env.POST_PROCESS_ON_DATASET_CLOSE === 'true' || false,
                FEATURE_FLAG_ENABLE_BULK_DELETE: process.env.FEATURE_FLAG_ENABLE_BULK_DELETE === 'true' || false,
                FEATURE_FLAG_ENABLE_CHANGE_TIER: process.env.FEATURE_FLAG_ENABLE_CHANGE_TIER === 'true' || false,
                FEATURE_FLAG_ENABLE_ANALYTICS: process.env.FEATURE_FLAG_ENABLE_ANALYTICS === 'true',
                FEATURE_FLAG_TIER_STORAGE_BLOCK: process.env.FEATURE_FLAG_TIER_STORAGE_BLOCK === 'true',
                FEATURE_FLAG_ENABLE_RESTORE: process.env.FEATURE_FLAG_ENABLE_RESTORE === 'true' || false,
                CCM_SERVICE_URL: AzureConfig.CCM_SERVICE_URL,
                CCM_TOKEN_SCOPE: AzureConfig.CCM_TOKEN_SCOPE,
                CALLER_FORWARD_HEADERS: process.env.CALLER_FORWARD_HEADERS ?
                    process.env.CALLER_FORWARD_HEADERS + ',' + AzureConfig.CORRELATION_ID :
                    AzureConfig.CORRELATION_ID,
                USER_ID_CLAIM_FOR_SDMS: process.env.USER_ID_CLAIM_FOR_SDMS || 'subid',
                GDPR_COMPLIANT_USER_ID_KEY: process.env.GDPR_COMPLIANT_USER_ID_KEY || 'oid',
                USER_ID_CLAIM_FOR_ENTITLEMENTS_SVC: process.env.USER_ID_CLAIM_FOR_ENTITLEMENTS_SVC || 'email',
                USER_ASSOCIATION_SVC_PROVIDER: process.env.USER_ASSOCIATION_SVC_PROVIDER || 'ccm-internal',
                SDMS_PREFIX: process.env.SDMS_PREFIX || AzureConfig.API_BASE_URL_PATH
            });

            // initialize app insight
            AzureInsightsLogger.initialize();

        } catch (error) {
            console.error('Unable to initialize configuration for azure cloud provider ' + error);
            throw error;
        }
    }
}
