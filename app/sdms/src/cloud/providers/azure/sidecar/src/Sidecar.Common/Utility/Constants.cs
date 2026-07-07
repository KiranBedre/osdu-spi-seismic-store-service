// ============================================================================
// Copyright 2017-2023, Microsoft
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

namespace Sidecar.Common.Utility;

public static class Constants
{
    /// <summary>
    /// Names of the secrets in the Key Vault.
    ///
    /// Copied from:
    /// https://community.opengroup.org/osdu/platform/domain-data-mgmt-services/seismic/seismic-dms-suite/seismic-store-service/-/blob/master/app/sdms/src/cloud/providers/azure/keyvault.ts?ref_type=heads
    /// </summary>
    public static class SecretNames
    {
        /// <summary>
        /// Hostname of the redis instance that stores the locks and the queues.
        /// </summary>
        public const string REDIS_SHARED_HOSTNAME = "redis-hostname";

        /// <summary>
        /// Password of the redis instance that stores the locks and the queues.
        /// </summary>
        public const string REDIS_SHARED_PASSWORD = "redis-password";  // pragma: allowlist secret

        /// <summary>
        /// Hostname of the redis instance that stores the locks and the queues.
        /// </summary>
        public const string REDIS_LOCKS_HOSTNAME = "redis-queue-hostname";

        /// <summary>
        /// Password of the redis instance that stores the locks and the queues.
        /// </summary>
        public const string REDIS_LOCKS_PASSWORD = "redis-queue-password";  // pragma: allowlist secret

        /// <summary>
        /// Resource ID of the Azure Active Directory application.
        /// Can be used to e.g. request access tokens in the current AD application.
        /// </summary>
        public const string APP_RESOURCE_ID = "aad-client-id";

        /// <summary>
        /// Endpoint for working with Azure Storage Queues on the central storage account.
        /// </summary>
        public const string CENTRAL_STORAGE_QUEUE_ENDPOINT = "queue-storage-endpoint";
    }

    public const int BLOB_BULK_DELETE_BATCH_SIZE = 256;

    public const int BLOB_BULK_CHANGE_TIER_BATCH_SIZE = 256;

    public const string DELETE_LOCK_PREFIX = "WDELETE";

    public const string WRITE_LOCK_PREFIX = "W";

    /// <summary>
    /// Prefix for operation-level locks to prevent concurrent processing of the same operation
    /// </summary>
    public const string OPERATION_LOCK_PREFIX = "OP:";

    public static class DeleteOperationStatus
    {
        public const string LAST_UPDATED_AT = "LastUpdatedAt";
        public const string STATUS = "Status";
        public const string STATUS_DESCRIPTION = "StatusDescription";
        public const string DATASETS_CNT = "DatasetsCnt";
        public const string COMPLETED_CNT = "CompletedCnt";
        public const string FAILED_CNT = "FailedCnt";
    }
    public static class ChangeTierOperationStatus
    {
        public const string LAST_UPDATED_AT = "LastUpdatedAt";
        public const string STATUS = "Status";
        public const string DATASETS_CNT = "DatasetsCnt";
        public const string COMPLETED_CNT = "CompletedCnt";
        public const string FAILED_CNT = "FailedCnt";
    }

    /// <summary>
    /// Configuration constants for change tier operations
    /// </summary>
    public static class ChangeTierConfiguration
    {
        /// <summary>
        /// Time-to-live for write locks. Must match NodeJS EXP_WRITE_LOCK = 86400 seconds
        /// </summary>
        public const int LOCK_TTL_HOURS = 24;

        /// <summary>
        /// Number of datasets to process per page when querying Cosmos DB
        /// </summary>
        public const int PAGE_LIMIT = 100;

        /// <summary>
        /// Maximum number of retry attempts for metadata tier updates
        /// </summary>
        public const int METADATA_UPDATE_MAX_RETRIES = 3;

        /// <summary>
        /// Initial delay in milliseconds for metadata update exponential backoff
        /// </summary>
        public const int METADATA_UPDATE_INITIAL_DELAY_MS = 100;

        /// <summary>
        /// Base for exponential backoff calculations
        /// </summary>
        public const int EXPONENTIAL_BACKOFF_BASE = 2;

        /// <summary>
        /// Error count returned when a container does not exist during blob tier change
        /// </summary>
        public const int CONTAINER_NOT_FOUND_ERROR_COUNT = 1;
    }

    /// <summary>
    /// Configuration constants for lock manager retry behavior
    /// </summary>
    public static class LockManagerConfiguration
    {
        /// <summary>
        /// Number of retry attempts for transient errors during lock operations
        /// </summary>
        public const int RETRY_ATTEMPTS = 3;

        /// <summary>
        /// Initial delay in milliseconds for retry exponential backoff
        /// </summary>
        public const int RETRY_INITIAL_DELAY_MS = 100;

        /// <summary>
        /// Base for exponential backoff calculations
        /// </summary>
        public const int EXPONENTIAL_BACKOFF_BASE = 2;
    }

    /// <summary>
    /// Cosmos DB database and container name constants
    /// </summary>
    public static class CosmosDb
    {
        /// <summary>
        /// Cosmos DB database ID for SDMS
        /// </summary>
        public const string DATABASE_ID = "sdms-db";

        /// <summary>
        /// Main data container for datasets, subprojects, apps, etc.
        /// </summary>
        public const string DATA_CONTAINER_ID = "data";

        /// <summary>
        /// Container for storing change tier operation status
        /// </summary>
        public const string CHANGE_TIER_STATUS_CONTAINER_ID = "ChangeTierOperationStatus";

        /// <summary>
        /// Container for tracking change tier failures
        /// </summary>
        public const string CHANGE_TIER_FAILURE_CONTAINER_ID = "ChangeTierFailure";

        /// <summary>
        /// Maximum number of items to fetch in a single query
        /// </summary>
        public const int MAX_ITEM_COUNT = 1000;

        /// <summary>
        /// Maximum concurrency for parallel Cosmos operations
        /// </summary>
        public const int MAX_CONCURRENCY = 32;

        /// <summary>
        /// Container for storing restore operation status
        /// </summary>
        public const string RESTORE_STATUS_CONTAINER_ID = "RestoreOperationStatus";

        /// <summary>
        /// Container for storing archived dataset metadata snapshots
        /// </summary>
        public const string ARCHIVE_DATASET_METADATA_CONTAINER_ID = "ArchiveDatasetMetadata";
    }

    /// <summary>
    /// Configuration constants for restore operations
    /// </summary>
    public static class RestoreConfiguration
    {
        /// <summary>
        /// TTL for the per-storage-account Redis concurrency lock.
        /// Must exceed the worst-case PITR restore duration.
        /// A pod crash auto-frees the lock after this window.
        /// Same-operation retry (idempotent re-acquire) is unaffected by this TTL.
        /// </summary>
        public const int LOCK_TTL_HOURS = 5;

        /// <summary>
        /// Redis lock key prefix scoped to restore operations.
        /// Full key: restore-op:{dataPartitionId}
        /// </summary>
        public const string LOCK_KEY_PREFIX = "restore-op:";

        /// <summary>
        /// Default poll interval (seconds) when ARM does not provide Retry-After.
        /// </summary>
        public const int POLL_DEFAULT_INTERVAL_SECONDS = 5;

        /// <summary>
        /// Maximum fallback poll interval (seconds) for exponential backoff.
        /// </summary>
        public const int POLL_MAX_FALLBACK_INTERVAL_SECONDS = 60;

        /// <summary>
        /// Maximum total polling duration (hours) before timing out the restore status loop.
        /// </summary>
        public const int POLL_MAX_DURATION_HOURS = 2;

        /// <summary>
        /// Maximum exponent used by fallback exponential backoff to cap growth.
        /// </summary>
        public const int POLL_MAX_BACKOFF_EXPONENT = 10;

        /// <summary>
        /// Maximum number of concurrent blob operations during restore/validation.
        /// </summary>
        public const int PARALLEL_BLOB_RESTORE_LIMIT = 5;

        /// <summary>
        /// Azure Storage resource-provider (management-plane) API version used for
        /// Point-in-Time Restore (restoreBlobRanges) requests.
        /// </summary>
        public const string STORAGE_MANAGEMENT_API_VERSION = "2025-06-01";

        /// <summary>
        /// Poll interval (seconds) while waiting for an undeleted container to become
        /// visible before proceeding with blob restore.
        /// </summary>
        public const int CONTAINER_VISIBILITY_POLL_INTERVAL_SECONDS = 3;

        /// <summary>
        /// Maximum number of attempts to confirm an undeleted container is visible.
        /// </summary>
        public const int CONTAINER_VISIBILITY_MAX_ATTEMPTS = 10;
    }

    /// <summary>
    /// Subproject access-policy values that determine container ownership semantics.
    /// 'dataset' gives each dataset a dedicated container (deleted with the dataset);
    /// 'uniform' shares a single container across datasets in the subproject.
    /// </summary>
    public static class AccessPolicy
    {
        public const string DATASET = "dataset";
        public const string UNIFORM = "uniform";
    }

    /// <summary>
    /// Constants for resolving Azure management-plane storage resource identity.
    /// </summary>
    public static class StorageResource
    {
        /// <summary>
        /// Key used to locate the account name in a storage connection string
        /// (e.g. "AccountName=&lt;name&gt;").
        /// </summary>
        public const string ACCOUNT_NAME_KEY = "AccountName=";

        /// <summary>
        /// Prefix of the compute resource group name from which the data-partition
        /// resource group is derived for PITR operations.
        /// </summary>
        public const string COMPUTE_RG_PREFIX = "Compute-rg-";
    }
}
