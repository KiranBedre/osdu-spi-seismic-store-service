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
        /// Instrumentation key of Application Insights.
        /// </summary>
        public const string APP_INSIGHTS_INSTRUMENTATION_KEY = "appinsights-key";

        /// <summary>
        /// Endpoint for working with Azure Storage Queues on the central storage account.
        /// </summary>
        public const string CENTRAL_STORAGE_QUEUE_ENDPOINT = "queue-storage-endpoint";
    }

    public const int BLOB_BULK_DELETE_BATCH_SIZE = 1000;

    public const string DELETE_LOCK_PREFIX = "WDELETE";

    public const string STORAGE_QUEUE_NAME = "delete-tasks";

    public static class DeleteOperationStatus
    {
        public const string LAST_UPDATED_AT = "LastUpdatedAt";
        public const string STATUS = "Status";
        public const string STATUS_DESCRIPTION = "StatusDescription";
        public const string DATASETS_CNT = "DatasetsCnt";
        public const string COMPLETED_CNT = "CompletedCnt";
        public const string FAILED_CNT = "FailedCnt";
    }
}
